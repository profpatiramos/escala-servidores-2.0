import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { errorMessage, formatDate } from "@/lib/format";
import {
  emptyMonthlyConfig,
  monthlyConfigSchema,
  monthlyPlan,
  MONTHLY_SLOTS,
  type MonthlyConfig,
} from "@shared/monthlySchedule";

const normalize = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export default function MonthlySchedule() {
  const utils = trpc.useUtils();
  const stored = trpc.monthlySchedule.config.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const servers = trpc.people.servers.list.useQuery({ includeInactive: false });
  const roles = trpc.availability.roles.list.useQuery({
    includeInactive: false,
  });
  const [draft, setDraft] = useState<MonthlyConfig | null>(null);
  const config = draft ?? stored.data ?? emptyMonthlyConfig();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    { date: string; time: string; id: number | null; message: string }[]
  >([]);
  const [year, monthNumber] = month.split("-").map(Number);
  const validMonth =
    Number.isInteger(year) &&
    year >= 2020 &&
    year <= 2100 &&
    monthNumber >= 1 &&
    monthNumber <= 12;
  const plan = validMonth ? monthlyPlan(year, monthNumber, config.fifth) : [];
  const save = trpc.monthlySchedule.save.useMutation({
    onSuccess: async () => {
      await utils.monthlySchedule.config.invalidate();
      setDraft(null);
      toast.success("Equipes salvas para os próximos meses.");
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const generate = trpc.monthlySchedule.generate.useMutation({
    onSuccess: rows => {
      setResult(rows);
      void utils.schedules.celebrations.list.invalidate();
      toast.success(
        "Geração concluída. Revise os resultados antes de publicar."
      );
    },
    onError: e => toast.error(errorMessage(e)),
  });
  const working = busy || save.isPending || generate.isPending;
  function changeMember(
    teamIndex: number,
    memberIndex: number,
    key: "serverId" | "parishRoleId",
    value: number
  ) {
    setDraft({
      ...config,
      teams: config.teams.map((team, i) =>
        i === teamIndex
          ? {
              ...team,
              members: team.members.map((member, j) =>
                j === memberIndex ? { ...member, [key]: value } : member
              ),
            }
          : team
      ),
    });
  }
  async function template() {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("Equipes");
      sheet.addRow(["Equipe", "Celebração", "Servidor", "Função"]);
      config.teams.forEach(team => {
        const slot = MONTHLY_SLOTS.find(s => s.id === team.slot)!;
        if (!team.members.length)
          sheet.addRow([
            team.color === "GREEN" ? "Verde" : "Azul",
            slot.label,
            "",
            "",
          ]);
        team.members.forEach(member =>
          sheet.addRow([
            team.color === "GREEN" ? "Verde" : "Azul",
            slot.label,
            servers.data?.find(s => s.id === member.serverId)?.name ?? "",
            roles.data?.find(r => r.id === member.parishRoleId)?.name ?? "",
          ])
        );
      });
      sheet.columns.forEach(c => {
        c.width = 35;
      });
      sheet.getRow(1).font = { bold: true };
      const help = book.addWorksheet("Instruções");
      help.addRow([
        "Preencha a aba Equipes. Uma linha por servidor e função. Use os nomes exatos dos cadastros abaixo.",
      ]);
      help.addRow([
        "A importação substitui a configuração das oito equipes na tela. Revise e clique em Salvar equipes.",
      ]);
      help.addRow([
        "Não inclua datas de nascimento, PINs ou dados dos responsáveis.",
      ]);
      const people = book.addWorksheet("Servidores cadastrados");
      people.addRow(["Nome"]);
      servers.data?.forEach(s => people.addRow([s.name]));
      people.getColumn(1).width = 55;
      const functions = book.addWorksheet("Funções cadastradas");
      functions.addRow(["Nome"]);
      roles.data?.forEach(r => functions.addRow([r.name]));
      functions.getColumn(1).width = 40;
      const buffer = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "equipes-escala-mensal.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Use uma planilha de até 10 MB.");
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const sheet = book.getWorksheet("Equipes");
      if (!sheet) throw new Error("Use a aba Equipes do modelo Excel.");
      if (sheet.rowCount > 401)
        throw new Error("Importe até 400 integrantes por vez.");
      const headers = [1, 2, 3, 4].map(i =>
        normalize(sheet.getRow(1).getCell(i).text)
      );
      if (headers.join("|") !== "equipe|celebracao|servidor|funcao")
        throw new Error("Mantenha os cabeçalhos do modelo Excel.");
      const next = emptyMonthlyConfig();
      next.fifth = config.fifth;
      let count = 0;
      sheet.eachRow((row, index) => {
        if (index === 1) return;
        const [color, slot, name, role] = [1, 2, 3, 4].map(i =>
          normalize(row.getCell(i).text)
        );
        if (!name && !role) return;
        const team = next.teams.find(
          t =>
            normalize(t.color === "GREEN" ? "Verde" : "Azul") === color &&
            normalize(MONTHLY_SLOTS.find(s => s.id === t.slot)!.label) === slot
        );
        const foundServers = (servers.data ?? []).filter(
          s => normalize(s.name) === name
        );
        const foundRoles = (roles.data ?? []).filter(
          r => normalize(r.name) === role
        );
        if (!team || foundServers.length !== 1 || foundRoles.length !== 1)
          throw new Error(
            `Linha ${index}: confira equipe, celebração, servidor e função. Nomes precisam corresponder a um único cadastro.`
          );
        team.members.push({
          serverId: foundServers[0].id,
          parishRoleId: foundRoles[0].id,
        });
        count++;
      });
      if (!count) throw new Error("Nenhum integrante preenchido na planilha.");
      setDraft(monthlyConfigSchema.parse(next));
      toast.success(
        `${count} integrantes carregados. Revise e salve as equipes.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (stored.isLoading || servers.isLoading || roles.isLoading)
    return <p>Carregando equipes…</p>;
  if (stored.isError || servers.isError || roles.isError)
    return (
      <div role="alert">
        Não foi possível carregar os cadastros.{" "}
        <Button
          onClick={() => {
            void stored.refetch();
            void servers.refetch();
            void roles.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Escala mensal</h1>
        <p className="text-sm text-muted-foreground">
          Equipes fixas verde e azul. Gere rascunhos, revise e publique em
          Celebrações.
        </p>
      </header>
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">1. Configure as equipes</h2>
          <p className="text-sm">
            Verde: primeiro e terceiro fins de semana. Azul: segundo e quarto.
            Aos domingos às 10h, verde no primeiro e segundo; azul no terceiro e
            quarto. Confira Missa ou Celebração da Palavra na revisão.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void template()}
            >
              Baixar modelo Excel
            </Button>
            <Label htmlFor="monthly-excel">Importar equipes do Excel</Label>
            <Input
              id="monthly-excel"
              className="max-w-xs"
              type="file"
              accept=".xlsx"
              disabled={working}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Os nomes devem existir em Servidores e Funções. A importação
            substitui as equipes na tela; só é gravada ao salvar.
          </p>
          <fieldset disabled={working} className="grid gap-4 lg:grid-cols-2">
            {config.teams.map((team, index) => (
              <section
                key={`${team.slot}:${team.color}`}
                className={`space-y-3 rounded-lg border p-4 ${team.color === "GREEN" ? "border-green-300" : "border-blue-300"}`}
              >
                <h3 className="font-medium">
                  {MONTHLY_SLOTS.find(s => s.id === team.slot)?.label} ·{" "}
                  {team.color === "GREEN" ? "Verde" : "Azul"}
                </h3>
                {team.members.map((member, j) => (
                  <div key={j} className="flex flex-wrap gap-2">
                    <select
                      aria-label={`Servidor ${j + 1} da equipe ${index + 1}`}
                      className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
                      value={member.serverId || ""}
                      onChange={e =>
                        changeMember(
                          index,
                          j,
                          "serverId",
                          Number(e.target.value)
                        )
                      }
                    >
                      <option value="">Servidor</option>
                      {servers.data?.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Função ${j + 1} da equipe ${index + 1}`}
                      className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
                      value={member.parishRoleId || ""}
                      onChange={e =>
                        changeMember(
                          index,
                          j,
                          "parishRoleId",
                          Number(e.target.value)
                        )
                      }
                    >
                      <option value="">Função</option>
                      {roles.data?.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      aria-label={`Remover integrante ${j + 1} da equipe ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...config,
                          teams: config.teams.map((t, i) =>
                            i === index
                              ? {
                                  ...t,
                                  members: t.members.filter((_, k) => k !== j),
                                }
                              : t
                          ),
                        })
                      }
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={team.members.length >= 50}
                  onClick={() =>
                    setDraft({
                      ...config,
                      teams: config.teams.map((t, i) =>
                        i === index
                          ? {
                              ...t,
                              members: [
                                ...t.members,
                                { serverId: 0, parishRoleId: 0 },
                              ],
                            }
                          : t
                      ),
                    })
                  }
                >
                  Adicionar integrante
                </Button>
              </section>
            ))}
          </fieldset>
          <Label htmlFor="monthly-fifth">Quinto fim de semana</Label>
          <select
            id="monthly-fifth"
            className="rounded border bg-background p-2"
            disabled={working}
            value={config.fifth}
            onChange={e =>
              setDraft({
                ...config,
                fifth: e.target.value as MonthlyConfig["fifth"],
              })
            }
          >
            <option value="MANUAL">Escolher equipe manualmente</option>
            <option value="GREEN">Equipe verde</option>
            <option value="BLUE">Equipe azul</option>
          </select>
          <div>
            <Button
              disabled={
                working || !monthlyConfigSchema.safeParse(config).success
              }
              onClick={() => save.mutate(config)}
            >
              {save.isPending ? "Salvando…" : "Salvar equipes"}
            </Button>
            {draft && (
              <span className="ml-3 text-sm">Há alterações não salvas.</span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">
            2. Confira o mês e gere os rascunhos
          </h2>
          <Label htmlFor="monthly-month">Mês e ano</Label>
          <Input
            id="monthly-month"
            type="month"
            min="2020-01"
            max="2100-12"
            className="max-w-xs"
            value={month}
            disabled={working}
            onChange={e => {
              setMonth(e.target.value);
              setResult([]);
            }}
          />
          <p className="text-sm">
            {plan.length} celebrações. Horários de término sugeridos: 1h15 após
            o início. Ajuste na revisão. Festas e celebrações extras podem ser
            incluídas em{" "}
            <Link href="/celebracoes" className="underline">
              Celebrações
            </Link>
            .
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Equipe</th>
                  <th>Integrantes</th>
                </tr>
              </thead>
              <tbody>
                {plan.map(item => (
                  <tr key={`${item.date}:${item.slot.id}`} className="border-t">
                    <td className="py-2">{formatDate(item.date)}</td>
                    <td>{item.slot.startTime}</td>
                    <td>
                      {item.color === "GREEN"
                        ? "Verde"
                        : item.color === "BLUE"
                          ? "Azul"
                          : "Escolher manualmente"}
                    </td>
                    <td>
                      {config.teams.find(
                        t => t.slot === item.slot.id && t.color === item.color
                      )?.members.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={
              working ||
              !validMonth ||
              draft !== null ||
              !config.teams.some(t => t.members.length)
            }
            onClick={() => generate.mutate({ year, month: monthNumber })}
          >
            {generate.isPending
              ? "Gerando rascunhos…"
              : "Gerar mês em rascunho"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Celebrações já existentes na mesma data e horário serão preservadas.
            Nenhuma escala será publicada automaticamente.
          </p>
        </CardContent>
      </Card>
      {!!result.length && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="font-semibold">3. Revise os resultados</h2>
            {result.map((row, i) => (
              <div key={i} className="border-t py-2 text-sm">
                <strong>
                  {formatDate(row.date)} · {row.time}
                </strong>
                <p>{row.message}</p>
                {row.id && (
                  <Link
                    className="text-primary underline"
                    href={`/celebracoes/${row.id}`}
                  >
                    Abrir e revisar escala
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
