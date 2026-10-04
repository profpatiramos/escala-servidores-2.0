import { z } from "zod";
import { calculateAge, isMinor } from "./domain";

export const importPersonSchema = z
  .object({
    name: z.string().trim().min(3).max(180),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(value => {
        const date = new Date(value + "T12:00:00Z");
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          calculateAge(value) >= 4 &&
          calculateAge(value) <= 100
        );
      }, "Informe uma data de nascimento válida (idade entre 4 e 100 anos)."),
    fatherName: z.string().trim().max(180).default(""),
    motherName: z.string().trim().max(180).default(""),
    responsibleName: z.string().trim().max(180).default(""),
    responsibleEmail: z
      .union([z.string().trim().email().max(320), z.literal("")])
      .default(""),
    responsiblePhone: z.string().trim().max(32).default(""),
  })
  .superRefine((row, ctx) => {
    if (row.responsibleName && row.responsibleName.length < 3)
      ctx.addIssue({
        code: "custom",
        path: ["responsibleName"],
        message: "Informe o nome completo do responsável.",
      });
    if (isMinor(row.birthDate) && row.responsibleName.length < 3)
      ctx.addIssue({
        code: "custom",
        path: ["responsibleName"],
        message: "Menores precisam de responsável.",
      });
  });
export type ImportPerson = z.infer<typeof importPersonSchema>;
export const personKey = (name: string, birthDate: string) =>
  `${name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()}|${birthDate}`;

export function parseDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] ?? "";
  const delimiter = first.includes(";")
    ? ";"
    : first.includes("\t")
      ? "\t"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("Há aspas sem fechamento no arquivo.");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importDate(value: string): string {
  const match = value.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
}
