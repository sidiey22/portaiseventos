import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getEvent } from "@/lib/events";
import { applyFilters, loadRows, tableRows, toCsv, type Filters } from "@/lib/report";
import { canManage, getStaff } from "@/lib/staff";
import { slugify } from "@/lib/validation";

// Exportação da lista de inscritos (admin e gerente do evento), respeitando os filtros.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const s = await getStaff();
  if (!s || !Number.isInteger(id) || !(await canManage(s, id))) return new NextResponse("Sem acesso.", { status: 403 });
  const e = await getEvent(id);
  if (!e) return new NextResponse("Evento não encontrado.", { status: 404 });
  const u = new URL(req.url);
  const f: Filters = Object.fromEntries(["gender", "lot", "status", "band", "ck", "q", "qv"].map((k) => [k, u.searchParams.get(k) ?? undefined]));
  const table = tableRows(e, applyFilters(await loadRows(e), f), s.isAdmin);
  const name = `inscritos-${slugify(e.name) || e.id}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (u.searchParams.get("formato") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inscritos");
    ws.addRows(table.map((r) => r.map((c) => (/^[=+\-@]/.test(c) ? `'${c}` : c))));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
  }
  return new NextResponse(toCsv(table), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
