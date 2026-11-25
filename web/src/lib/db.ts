import { Pool } from 'pg';
const g = globalThis as any;
export const pool: Pool = g.__pool ?? (g.__pool = new Pool({ connectionString: process.env.DATABASE_URL }));
