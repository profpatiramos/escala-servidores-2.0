import { beforeEach, describe, expect, it, vi } from "vitest";
import { celebrations, celebrationRoleNeeds, schedules } from "../drizzle/schema";
const fixture = vi.hoisted(() => ({ missing:false, inserts:[] as { table:unknown; value:any }[] }));
vi.mock("./services/audit",()=>({recordAudit:vi.fn()}));
vi.mock("./db",()=>({getDbOrThrow:async()=>({transaction:async(callback:any)=>callback({
  select:()=>({from:(table:unknown)=>({where:()=> {const rows=table===celebrations ? fixture.missing ? [] : [{id:4,title:"Missa",celebrationType:"SUNDAY_MASS",location:"Igreja",notes:null}] : [{parishRoleId:8,quantity:2,requirements:"Formação"}]; return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}),
  insert:(table:unknown)=>({values:(value:any)=>{fixture.inserts.push({table,value});return Object.assign(Promise.resolve(),{returning:async()=>[{id:99}]});}}),
})})}));
import { schedulesRouter } from "./routers/schedules";
const caller = (role="COORDINATOR")=>schedulesRouter.createCaller({actor:{type:"USER",user:{id:1},parishId:7,role,sessionId:1},req:{headers:{}},res:{},user:null} as never);
const input={id:4,date:"2026-11-08",startTime:"19:00",endTime:"20:15"};
describe("duplicação de celebração",()=>{
  beforeEach(()=>{fixture.missing=false;fixture.inserts=[];});
  it("copia necessidades e cria rascunho sem atribuições ou presenças",async()=>{
    await expect(caller().celebrations.duplicate(input)).resolves.toEqual({id:99});
    expect(fixture.inserts.map(i=>i.table)).toEqual([celebrations,celebrationRoleNeeds,schedules]);
    expect(fixture.inserts[0].value).toMatchObject({parishId:7,date:input.date,status:"SCHEDULED"});
    expect(fixture.inserts[1].value).toEqual([{parishId:7,celebrationId:99,parishRoleId:8,quantity:2,requirements:"Formação"}]);
    expect(fixture.inserts[2].value).toMatchObject({celebrationId:99,status:"DRAFT",periodStart:input.date});
  });
  it("não escreve quando origem não existe no escopo",async()=>{fixture.missing=true;await expect(caller().celebrations.duplicate(input)).rejects.toMatchObject({code:"NOT_FOUND"});expect(fixture.inserts).toHaveLength(0);});
  it("recusa horário de término anterior ao início",async()=>{await expect(caller().celebrations.duplicate({...input,endTime:"18:00"})).rejects.toMatchObject({code:"BAD_REQUEST"});expect(fixture.inserts).toHaveLength(0);});
  it("recusa perfil de servidor",async()=>{await expect(caller("SERVER").celebrations.duplicate(input)).rejects.toMatchObject({code:"FORBIDDEN"});expect(fixture.inserts).toHaveLength(0);});
});
