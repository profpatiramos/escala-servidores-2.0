import { beforeEach, describe, expect, it, vi } from "vitest";
import { parishes } from "../drizzle/schema";
import { emptyMonthlyConfig } from "../shared/monthlySchedule";
const mocks=vi.hoisted(()=>({db:vi.fn(),create:vi.fn(),assign:vi.fn(),audit:vi.fn()}));
vi.mock("./db",()=>({getDbOrThrow:mocks.db}));
vi.mock("./services/audit",()=>({recordAudit:mocks.audit}));
vi.mock("./routers/schedules",()=>({schedulesRouter:{createCaller:()=>({celebrations:{create:mocks.create},setAssignments:mocks.assign})}}));
import { monthlyScheduleRouter } from "./routers/monthlySchedule";

function values(node:any):any[] {
  if(!node||typeof node!=="object")return [];
  return [...(Array.isArray(node.queryChunks)?node.queryChunks.flatMap(values):[]),...(Object.hasOwn(node,"value")?[node.value]:[])];
}
function caller(role="COORDINATOR") {
  return monthlyScheduleRouter.createCaller({actor:{type:"USER",user:{id:4},parishId:7,role},req:{headers:{}},res:{},user:null} as any);
}
describe("API de escala mensal",()=>{
  let created:Map<string,number>;
  beforeEach(()=>{
    vi.clearAllMocks();created=new Map();const config=emptyMonthlyConfig();
    config.teams[0].members=[{serverId:12,parishRoleId:3}];
    mocks.db.mockResolvedValue({
      select:()=>({from:(table:unknown)=>({where:(condition:any)=>({limit:async()=>{
        if(table===parishes)return [{settings:{monthlySchedule:config}}];
        const v=values(condition);const date=v.find(s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s));const time=v.find(s=>typeof s==="string"&&/^\d{2}:\d{2}:\d{2}$/.test(s));
        const id=created.get(`${date}:${time}`);return id?[{id}]:[];
      }})})}),
      transaction:async(work:any)=>work({execute:vi.fn()}),
    });
    mocks.create.mockImplementation(async(input:any)=>{const id=created.size+1;created.set(`${input.date}:${input.startTime}:00`,id);return {id};});
    mocks.assign.mockResolvedValue({saved:true,validation:{valid:true,blocking:[],warnings:[]}});
  });
  it("cria o mês em rascunhos e não duplica ao repetir",async()=>{
    const first=await caller().generate({year:2026,month:10});
    expect(first).toHaveLength(17);expect(mocks.create).toHaveBeenCalledTimes(17);
    expect(mocks.assign).toHaveBeenCalledTimes(2);
    await caller().generate({year:2026,month:10});
    expect(mocks.create).toHaveBeenCalledTimes(17);
    expect(mocks.assign).toHaveBeenCalledTimes(2);
  });
  it("retorna bloqueios da validação em vez de afirmar que salvou a equipe",async()=>{
    mocks.assign.mockResolvedValue({saved:false,validation:{valid:false,blocking:[{message:"Servidor em férias"}],warnings:[]}});
    const rows=await caller().generate({year:2026,month:10});
    expect(rows.filter(r=>r.message.includes("Servidor em férias"))).toHaveLength(2);
  });
  it("impede que um servidor gere escalas ou altere equipes",async()=>{
    await expect(caller("SERVER").generate({year:2026,month:10})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller("SERVER").save(emptyMonthlyConfig())).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
