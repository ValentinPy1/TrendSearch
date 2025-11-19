import postgres from 'postgres';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
  const rows = await sql`
    select keyword, monthly_data
    from keyword_embeddings
    where keyword = ${'restaurant dashboards'}
    limit 1
  `;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
