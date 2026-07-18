import { createUser } from './authStore';

function argument(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) throw new Error(`MISSING_ARGUMENT:${name}`);
  return value;
}

async function main() {
  const user = await createUser({
    farmId: argument('farm-id'),
    farmName: argument('farm-name'),
    name: argument('name'),
    email: argument('email'),
    password: argument('password'),
    role: 'owner'
  });

  console.log('試用アカウントを作成しました。');
  console.log(`農場ID: ${user.farmId}`);
  console.log(`農場名: ${user.farmName}`);
  console.log(`利用者名: ${user.name}`);
  console.log(`メール: ${user.email}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`試用アカウントを作成できませんでした: ${message}`);
  process.exitCode = 1;
});
