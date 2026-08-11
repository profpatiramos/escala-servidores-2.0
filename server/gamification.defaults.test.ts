/**
 * Testes das salvaguardas de gamificação.
 *
 * O sistema serve crianças e adolescentes. Ranking público e punição por falta
 * podem virar constrangimento, então a especificação exige que ambos venham
 * DESLIGADOS. Estes testes protegem esse default contra regressão silenciosa —
 * é o tipo de flag que alguém liga "só para testar" e nunca desliga.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINT_RULES,
  POINT_EVENT_TYPES,
  type PointEventType,
} from "@shared/domain";

describe("DEFAULT_POINT_RULES — salvaguardas para menores", () => {
  it("mantém a penalização por ausência injustificada DESABILITADA por padrão", () => {
    const rule = DEFAULT_POINT_RULES.find(r => r.eventType === "UNJUSTIFIED_ABSENCE");
    expect(rule).toBeDefined();
    expect(rule!.enabled).toBe(false);
  });

  it("não penaliza ausência justificada", () => {
    const rule = DEFAULT_POINT_RULES.find(r => r.eventType === "JUSTIFIED_ABSENCE");
    expect(rule).toBeDefined();
    expect(rule!.points).toBe(0);
  });

  it("a única regra com pontuação negativa é a que vem desligada", () => {
    const negatives = DEFAULT_POINT_RULES.filter(r => r.points < 0);
    expect(negatives.every(r => r.enabled === false)).toBe(true);
  });

  it("cobre todos os tipos de evento de pontuação, sem regra órfã", () => {
    const covered = DEFAULT_POINT_RULES.map(r => r.eventType).sort();
    const declared = [...POINT_EVENT_TYPES].sort();
    expect(covered).toEqual(declared);
  });

  it("não repete o mesmo tipo de evento em duas regras", () => {
    const seen = new Set<PointEventType>();
    for (const rule of DEFAULT_POINT_RULES) {
      expect(seen.has(rule.eventType)).toBe(false);
      seen.add(rule.eventType);
    }
  });

  it("toda regra tem descrição legível para exibir na configuração", () => {
    for (const rule of DEFAULT_POINT_RULES) {
      expect(rule.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("recompensa a presença mais do que a simples confirmação antecipada", () => {
    // O incentivo tem de premiar comparecer, não apenas prometer comparecer.
    const done = DEFAULT_POINT_RULES.find(r => r.eventType === "PARTICIPATION_DONE")!;
    const early = DEFAULT_POINT_RULES.find(r => r.eventType === "EARLY_CONFIRMATION")!;
    expect(done.points).toBeGreaterThan(early.points);
  });

  it("ajuste manual nasce neutro, para exigir valor explícito da coordenação", () => {
    const manual = DEFAULT_POINT_RULES.find(r => r.eventType === "MANUAL_ADJUSTMENT")!;
    expect(manual.points).toBe(0);
  });
});
