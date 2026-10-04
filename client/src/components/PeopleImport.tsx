import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "@/lib/format";
import {
  importDate,
  importPersonSchema,
  parseDelimited,
  type ImportPerson,
} from "@shared/peopleImport";

const fields = {
  name: "Nome do servidor",
  birthDate: "Nascimento",
  fatherName: "Nome do pai",
  motherName: "Nome da mãe",
  responsibleName: "Responsável principal",
  responsibleEmail: "E-mail do responsável",
  responsiblePhone: "Telefone do responsável",
};
const aliases: Record<string, string[]> = {
  name: ["nome", "servidor", "nomedoservidor"],
  birthDate: ["nascimento", "datadenascimento"],
  fatherName: ["pai", "nomedopai"],
  motherName: ["mae", "nomedamae"],
  responsibleName: ["responsavel", "responsavelprincipal"],
  responsibleEmail: ["email", "emaildoresponsavel"],
  responsiblePhone: ["telefone", "telefonedoresponsavel", "celular"],
};
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

export default function PeopleImport() {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [table, setTable] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({});
  const [pdfText, setPdfText] = useState("");
  const utils = trpc.useUtils();
  const save = trpc.peopleImport.save.useMutation({
    onSuccess: result => {
      toast.success(
        `${result.created} servidores e ${result.relatives} responsáveis cadastrados. ${result.skipped} servidores já existentes ignorados.`
      );
      void utils.people.servers.list.invalidate();
      void utils.people.responsibles.list.invalidate();
      setOpen(false);
      setTable([]);
      setPdfText("");
    },
    onError: error => toast.error(errorMessage(error)),
  });
  function loadTable(rows: string[][]) {
    if (rows.length < 2)
      throw new Error("O arquivo precisa de cabeçalho e pelo menos uma linha.");
    if (rows.length > 301)
      throw new Error("Importe no máximo 300 servidores por vez.");
    setTable(rows);
    setMapping(
      Object.fromEntries(
        Object.keys(fields).map(field => {
          const index = rows[0].findIndex(h =>
            aliases[field].includes(normalize(h))
          );
          return [field, index < 0 ? "" : String(index)];
        })
      )
    );
  }
  async function readFile(file: File) {
    setBusy(true);
    setTable([]);
    setPdfText("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("O limite do arquivo é 10 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "csv") loadTable(parseDelimited(await file.text()));
      else if (extension === "xlsx") {
        const ExcelJS = await import("exceljs");
        const workbook = new ExcelJS.default.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        if (workbook.worksheets.length !== 1)
          throw new Error(
            "Use uma planilha com apenas uma aba para esta importação."
          );
        const rows: string[][] = [];
        workbook.worksheets[0].eachRow(row => {
          const values: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, col) => {
            values[col - 1] =
              cell.value instanceof Date
                ? cell.value.toISOString().slice(0, 10)
                : cell.text;
          });
          rows.push(values);
        });
        loadTable(rows);
      } else if (extension === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        const task = pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        });
        const pdf = await task.promise;
        try {
          if (pdf.numPages > 30) throw new Error("Use PDFs de até 30 páginas.");
          const lines: string[] = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const content = await page.getTextContent();
            const rows = new Map<number, { x: number; text: string }[]>();
            for (const item of content.items) {
              if (!("str" in item)) continue;
              const y = Math.round(item.transform[5] / 3) * 3;
              const line = rows.get(y) ?? [];
              line.push({ x: item.transform[4], text: item.str });
              rows.set(y, line);
            }
            for (const [, row] of [...rows].sort((a, b) => b[0] - a[0]))
              lines.push(
                row
                  .sort((a, b) => a.x - b.x)
                  .map(item => item.text)
                  .join(" ")
              );
          }
          const text = lines.join("\n").trim();
          if (!text)
            throw new Error(
              "Este PDF não contém texto selecionável. Converta o documento escaneado para CSV ou Excel."
            );
          setPdfText(text);
        } finally {
          await task.destroy();
        }
      } else throw new Error("Use Excel .xlsx, CSV ou PDF.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o arquivo."
      );
    } finally {
      setBusy(false);
    }
  }
  const preview = table.slice(1).map(row => {
    const values = Object.fromEntries(
      Object.keys(fields).map(field => [
        field,
        mapping[field] === "" || mapping[field] === undefined
          ? ""
          : (row[Number(mapping[field])] ?? ""),
      ])
    );
    values.birthDate = importDate(values.birthDate);
    return { values, result: importPersonSchema.safeParse(values) };
  });
  const invalid = preview.some(row => !row.result.success);
  function model() {
    const blob = new Blob(
      [
        "\uFEFFNome do servidor;Nascimento;Nome do pai;Nome da mãe;Responsável principal;E-mail do responsável;Telefone do responsável\n",
      ],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-servidores.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Importar lista
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!save.isPending && !busy) setOpen(value);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar servidores e familiares</DialogTitle>
            <DialogDescription>
              Revise os dados antes de salvar. Novos servidores entram em
              formação, com acesso pendente de ativação. Responsáveis são
              cadastrados sem senha; o acesso deles pode ser configurado depois.
              Servidores com mesmo nome e nascimento já cadastrados serão
              ignorados.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={model}>
            Baixar modelo CSV
          </Button>
          <Label htmlFor="peopleFile">
            Arquivo Excel (.xlsx), CSV ou PDF com texto
          </Label>
          <Input
            id="peopleFile"
            type="file"
            accept=".xlsx,.csv,.pdf"
            disabled={busy || save.isPending}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
          {busy && <p role="status">Lendo arquivo…</p>}
          {pdfText && (
            <>
              <Label htmlFor="pdfImportText">
                Texto do PDF — organize uma linha por servidor, com cabeçalho e
                colunas separadas por ponto e vírgula
              </Label>
              <textarea
                id="pdfImportText"
                className="w-full min-h-40 rounded border p-3"
                value={pdfText}
                onChange={event => setPdfText(event.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    loadTable(parseDelimited(pdfText));
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                Montar prévia do texto
              </Button>
            </>
          )}
          {table.length > 0 && (
            <>
              <p>
                Associe as colunas do arquivo. Nascimento: DD/MM/AAAA ou
                AAAA-MM-DD. Para menores, indique o responsável principal. Pai e
                mãe são nomes familiares; não recebem acesso automático.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(fields).map(([field, label]) => (
                  <div key={field}>
                    <Label htmlFor={`column-${field}`}>{label}</Label>
                    <select
                      id={`column-${field}`}
                      className="w-full border rounded p-2"
                      value={mapping[field] ?? ""}
                      onChange={event =>
                        setMapping({ ...mapping, [field]: event.target.value })
                      }
                    >
                      <option value="">Não informado</option>
                      {table[0].map((header, index) => (
                        <option key={index} value={index}>
                          {header || `Coluna ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      {Object.values(fields).map(label => (
                        <th key={label}>{label}</th>
                      ))}
                      <th>Validação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, index) => (
                      <tr key={index}>
                        <td>{index + 2}</td>
                        {Object.keys(fields).map(field => (
                          <td key={field} className="p-1">
                            <Input
                              aria-label={`${fields[field as keyof typeof fields]}, linha ${index + 2}`}
                              value={row.values[field]}
                              onChange={event => {
                                let col = mapping[field];
                                let next = table.map(line => [...line]);
                                if (col === "" || col === undefined) {
                                  col = String(next[0].length);
                                  next[0].push(
                                    fields[field as keyof typeof fields]
                                  );
                                  setMapping({ ...mapping, [field]: col });
                                }
                                next[index + 1][Number(col)] =
                                  event.target.value;
                                setTable(next);
                              }}
                            />
                          </td>
                        ))}
                        <td>
                          {row.result.success
                            ? "Pronto"
                            : row.result.error.issues
                                .map(
                                  issue =>
                                    `${fields[issue.path[0] as keyof typeof fields]}: ${issue.message}`
                                )
                                .join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                {preview.length} linhas.{" "}
                {invalid
                  ? "Corrija as pendências para importar."
                  : "Dados prontos para revisão final."}
              </p>
              <Button
                disabled={invalid || busy || save.isPending}
                onClick={() =>
                  save.mutate({
                    rows: preview.map(row =>
                      row.result.success
                        ? row.result.data
                        : (row.values as ImportPerson)
                    ),
                  })
                }
              >
                {save.isPending ? "Importando…" : "Confirmar importação"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
