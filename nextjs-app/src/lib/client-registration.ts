import { z } from "zod";
import { mobilePhonePattern, normalizePhoneDigits } from "./phone";

const namePart = z.string().trim().min(1).max(100);

export const clientRegistrationSchema = z.object({
  nome: namePart,
  sobrenome: namePart,
  telefone_whatsapp: z.string()
    .length(12)
    .regex(new RegExp(`^${mobilePhonePattern}$`))
    .transform(normalizePhoneDigits),
});

export const fullNameFits = ({ nome, sobrenome }: { nome: string; sobrenome: string }) =>
  nome.length + sobrenome.length + 1 <= 100;

export const clientRegistrationError =
  "Informe nome e sobrenome (até 100 caracteres no total) e um WhatsApp no formato 82 988887777.";
