import { expect, it } from "vitest";
import { reconcileMonthlyTeamLabel } from "../shared/monthlyTeamLabels";

it("corrige somente a etiqueta e preserva as demais observações", () => {
  expect(reconcileMonthlyTeamLabel("Escala mensal. Equipe azul. Levar material.", "GREEN"))
    .toEqual({ before: "azul", after: "verde", notes: "Escala mensal. Equipe verde. Levar material." });
});

it("retira a cor quando o quinto fim de semana pede escolha manual", () => {
  expect(reconcileMonthlyTeamLabel("Escala mensal. Equipe verde.", null)?.after).toBe("manual");
  expect(reconcileMonthlyTeamLabel("Celebração avulsa. Equipe verde.", "BLUE")).toBeNull();
  expect(reconcileMonthlyTeamLabel("Escala mensal. Equipe verde.", "GREEN")).toBeNull();
});
