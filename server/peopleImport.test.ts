import { describe, expect, it } from "vitest";
import { importPersonSchema, importDate, parseDelimited, personKey } from "../shared/peopleImport";
describe("importação de pessoas", () => {
  it("preserva delimitadores e quebras de linha dentro de aspas",()=>expect(parseDelimited('Nome;Nascimento\n"Maria; Clara";2012-01-01\n"José\nSilva";2010-01-02')).toEqual([["Nome","Nascimento"],["Maria; Clara","2012-01-01"],["José\nSilva","2010-01-02"]]));
  it("recusa CSV truncado",()=>expect(()=>parseDelimited('Nome\n"Maria')).toThrow());
  it("normaliza data brasileira",()=>expect(importDate("21/04/2012")).toBe("2012-04-21"));
  it("recusa data inexistente",()=>expect(importPersonSchema.safeParse({name:"Maria Silva",birthDate:"2012-02-31",responsibleName:"Ana Silva"}).success).toBe(false));
  it("recusa menor sem vínculo familiar",()=>expect(importPersonSchema.safeParse({name:"Maria Silva",birthDate:"2012-02-01"}).success).toBe(false));
  it("aceita menor com responsável e sem e-mail próprio",()=>expect(importPersonSchema.safeParse({name:"Maria Silva",birthDate:"2012-02-01",responsibleName:"Ana Silva"}).success).toBe(true));
  it("recusa contato inválido",()=>expect(importPersonSchema.safeParse({name:"Maria Silva",birthDate:"2012-02-01",responsibleName:"Ana Silva",responsibleEmail:"inválido"}).success).toBe(false));
  it("deduplica nomes equivalentes sem confundir datas",()=>{expect(personKey(" José Silva ","2012-01-01")).toBe(personKey("Jose Silva","2012-01-01"));expect(personKey("Jose Silva","2012-01-01")).not.toBe(personKey("Jose Silva","2013-01-01"));});
});
