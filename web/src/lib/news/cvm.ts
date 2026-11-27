/** Fatos relevantes e comunicados das companhias abertas (dados abertos da CVM; o arquivo é atualizado semanalmente). */
import { inflateRawSync } from 'node:zlib';

/** Código CVM das empresas dos papéis mais comuns (4 primeiras letras do ticker). */
export const CVM_CODES: Record<string, string> = {
  PETR: '9512', VALE: '4170', ITUB: '19348', BBDC: '906', BBAS: '1023', ABEV: '23264', WEGE: '5410', B3SA: '21610', RENT: '19739', SUZB: '13986',
  JBSS: '20575', GGBR: '3980', CSNA: '4030', USIM: '14320', ELET: '2437', EQTL: '20010', LREN: '8133', MGLU: '22470', HAPV: '24392', RADL: '5258',
  RAIL: '17450', PRIO: '22187', BPAC: '22616', ITSA: '7617', BBSE: '23159', CMIG: '2453', CPLE: '14311', VIVT: '17671', TIMS: '24929', KLBN: '12653',
  EMBR: '20087', AZUL: '24112', CSAN: '19836', UGPA: '18465', BRFS: '16292', TOTS: '19992', CYRE: '14460', MRVE: '20915', SANB: '20532',
};

const KINDS = ['Fato Relevante', 'Comunicado ao Mercado', 'Aviso aos Acionistas'];

export function unzipFirst(zip: Buffer): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('zip inválido');
  const central = zip.readUInt32LE(end + 16);
  const method = zip.readUInt16LE(central + 10), size = zip.readUInt32LE(central + 20), local = zip.readUInt32LE(central + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  return method === 8 ? inflateRawSync(data, { maxOutputLength: 200 * 1024 * 1024 }) : data;
}

export function csvRows(text: string): Record<string, string>[] {
  const [head, ...lines] = text.split(/\r?\n/);
  const keys = head.split(';');
  return lines.filter(Boolean).map((l) => { const v = l.split(';'); return Object.fromEntries(keys.map((k, i) => [k, v[i] ?? ''])); });
}

let cache: { at: number; year: number; rows: Record<string, string>[] } | null = null;
let loading: Promise<Record<string, string>[]> | null = null;

async function load(): Promise<Record<string, string>[]> {
  const year = new Date().getUTCFullYear();
  if (cache && cache.year === year && Date.now() - cache.at < 12 * 3600_000) return cache.rows;
  loading ??= (async () => {
    const base = process.env.CVM_URL ?? 'https://dados.cvm.gov.br';
    const r = await fetch(`${base}/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_${year}.zip`, { signal: AbortSignal.timeout(60_000), cache: 'no-store' });
    if (!r.ok) throw new Error(`CVM respondeu ${r.status}`);
    const rows = csvRows(unzipFirst(Buffer.from(await r.arrayBuffer())).toString('latin1')).filter((x) => KINDS.includes(x.Categoria));
    cache = { at: Date.now(), year, rows };
    return rows;
  })().finally(() => { loading = null; });
  return loading;
}

export async function cvmItems(symbol: string) {
  const code = CVM_CODES[symbol.slice(0, 4)];
  if (!code) return [];
  return (await load()).filter((x) => x.Codigo_CVM === code && /^https?:\/\//.test(x.Link_Download)).map((x) => ({
    title: `${x.Categoria}: ${x.Assunto || x.Tipo || 'sem assunto informado'}`.slice(0, 300), url: x.Link_Download, source: 'CVM',
    publishedAt: Math.floor(Date.parse(`${x.Data_Entrega}T15:00:00Z`) / 1000), // a CVM informa só a data
  })).filter((x) => Number.isFinite(x.publishedAt));
}
