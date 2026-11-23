import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";

const base = process.env.PILOT_TEST_BASE_URL;
const database = process.env.PILOT_TEST_DATABASE_URL;

test("pilot enforces shared limits, scoped requests and single-use codes", {
  skip: !base || !database ? "Configure PILOT_TEST_BASE_URL and PILOT_TEST_DATABASE_URL for an isolated instance" : false,
}, async () => {
  const sql = postgres(database, { prepare: false });
  const run = randomUUID().slice(0, 8);
  const password = "Senha fictícia 123!";
  const newPassword = "Senha fictícia 456!";
  const email = `pilot-${run}@example.invalid`;
  const branchEmail = `branch-${run}@example.invalid`;
  const ipPrefix = `2001:db8:${run.slice(0, 4)}:${run.slice(4)}::`;

  function token() {
    return randomBytes(32).toString("base64url");
  }

  function hash(code) {
    return createHash("sha256").update(code).digest("hex");
  }

  function request(path, { body, cookie, bearer, ip = "10", method = body ? "POST" : "GET" } = {}) {
    const headers = { "x-real-ip": `${ipPrefix}${ip}` };
    if (body) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    return fetch(new URL(path, base), { headers, body: body && JSON.stringify(body), method });
  }

  async function invite(address, kind, ttl = "1 hour") {
    const code = token();
    await sql`insert into company_invites (token_hash, email, kind, expires_at)
      values (${hash(code)}, ${address}, ${kind}, now() + ${ttl}::interval)`;
    return code;
  }

  function session(response) {
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);
    return cookie.split(";")[0];
  }

  try {
    const signup = { email, empresa: "Loja do piloto", nome: "Titular do piloto", senha: password, telefone: "82912345678" };
    assert.equal((await request("/api/auth/register", { body: signup })).status, 400);
    assert.equal((await request("/api/auth/register", { body: { ...signup, convite: await invite(email, "cadastro", "-1 minute") } })).status, 403);
    const code = await invite(email, "cadastro");
    assert.equal((await request("/api/auth/register", { body: { ...signup, email: branchEmail, convite: code } })).status, 403);

    const attempts = await Promise.all([1, 2].map(() => request("/api/auth/register", { body: { ...signup, convite: code } })));
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [201, 403]);
    const registered = attempts.find(({ status }) => status === 201);
    const ownerCookie = session(registered);
    const { companyId, userId } = await registered.json();
    const branch = { empresa: "Filial do piloto", telefone: "82912345678", email: branchEmail };
    assert.equal((await request("/api/auth/companies", { cookie: ownerCookie, body: branch })).status, 400);
    const branchResult = await request("/api/auth/companies", { cookie: ownerCookie, body: { ...branch, convite: await invite(branchEmail, "nova-loja") } });
    assert.equal(branchResult.status, 201);
    const branchCookie = session(branchResult);
    const { comercioId: branchId } = await branchResult.json();

    const switchToBranch = { method: "PATCH", body: { comercioId: branchId } };
    assert.equal((await request("/api/auth/select", switchToBranch)).status, 401);
    const switched = await request("/api/auth/select", { ...switchToBranch, cookie: ownerCookie });
    assert.equal(switched.status, 200);
    assert.deepEqual(await switched.json(), { comercioId: branchId, cargo: "ADMIN" });
    const switchedCompanies = await request("/api/auth/companies", { cookie: session(switched) });
    assert.equal((await switchedCompanies.json()).comercioAtual.comercioId, branchId);

    const [{ id: customerId }] = await sql`insert into customers (company_id, name, phone)
      values (${companyId}, 'Cliente piloto', '82912345678') returning id`;
    const privacy = { cliente_id: customerId, tipo: "exportacao" };
    assert.equal((await request("/api/clients/data-requests", { cookie: branchCookie, body: privacy })).status, 404);
    const requests = await Promise.all([1, 2].map(() => request("/api/clients/data-requests", { cookie: ownerCookie, body: privacy })));
    assert.deepEqual(requests.map(({ status }) => status).sort(), [201, 409]);
    assert.equal((await (await request("/api/clients/data-requests", { cookie: ownerCookie })).json()).length, 1);
    assert.deepEqual(await (await request("/api/clients/data-requests", { cookie: branchCookie })).json(), []);
    assert.equal((await request("/api/clients/data-requests", { cookie: ownerCookie, body: { ...privacy, tipo: "exclusao" } })).status, 201);
    assert.equal((await sql`select id from customers where id = ${customerId}`).length, 1);

    const [{ id: serviceId }] = await sql`insert into services (company_id, name, price)
      values (${companyId}, 'Serviço piloto', 20) returning id`;
    const queuePath = `/api/public-queue/${companyId}/entries`;
    const entry = { nome: "Maria", sobrenome: "Teste", telefone_whatsapp: "82 988887777", servico_ids: [serviceId], ticket: randomBytes(32).toString("hex") };
    assert.equal((await request(queuePath, { body: entry })).status, 201);
    assert.equal((await request(queuePath, { body: entry })).status, 200);

    const login = await request("/api/auth/login", { body: { email, senha: password } });
    assert.equal(login.status, 200);
    const { tokenTemporario: oldSelectToken } = await login.json();
    const recovery = token();
    await sql`insert into password_resets (user_id, token_hash, expires_at)
      values (${userId}, ${hash(recovery)}, now() + interval '30 minutes')`;
    const reset = await Promise.all([1, 2].map(() => request("/api/auth/recovery", { body: { codigo: recovery, senha: newPassword } })));
    assert.deepEqual(reset.map(({ status }) => status).sort(), [200, 400]);
    assert.equal((await request("/api/auth/companies", { cookie: ownerCookie })).status, 401);
    assert.equal((await request("/api/auth/select", { bearer: oldSelectToken, body: { comercioId: branchId } })).status, 403);
    assert.equal((await request("/api/auth/login", { body: { email, senha: password } })).status, 401);
    const relogin = await request("/api/auth/login", { body: { email, senha: newPassword } });
    const { tokenTemporario: newSelectToken } = await relogin.json();
    assert.ok(newSelectToken);
    const reselected = await request("/api/auth/select", { bearer: newSelectToken, body: { comercioId: companyId } });
    assert.equal(reselected.status, 200);
    assert.equal((await request("/api/auth/companies", { cookie: session(reselected) })).status, 200);
    await sql`update user_companies set role = 'CAIXA' where company_id = ${branchId} and user_id = ${userId}`;
    const switchedCashier = await request("/api/auth/select", { ...switchToBranch, cookie: session(reselected) });
    assert.equal(switchedCashier.status, 200);
    assert.deepEqual(await switchedCashier.json(), { comercioId: branchId, cargo: "CAIXA" });
    assert.equal((await request("/api/clients/data-requests", { cookie: session(switchedCashier) })).status, 403);
    const cashier = await request("/api/auth/select", { bearer: newSelectToken, body: { comercioId: branchId } });
    assert.equal(cashier.status, 200);
    assert.equal((await request("/api/clients/data-requests", { cookie: session(cashier) })).status, 403);

    for (const [path, expected, ip] of [
      ["/api/auth/login", 30, "20"],
      ["/api/auth/register", 10, "21"],
      [queuePath, 60, "22"],
    ]) {
      const responses = await Promise.all(Array.from({ length: expected + 2 }, () => request(path, { body: {}, ip })));
      assert.equal(responses.filter(({ status }) => status === 400).length, expected);
      const blocked = responses.filter(({ status }) => status === 429);
      assert.equal(blocked.length, 2);
      assert.ok(Number(blocked[0].headers.get("retry-after")) > 0);
      assert.equal((await request(path, { body: {}, ip: "23" })).status, 400);
    }
  } finally {
    await sql.end();
  }
});
