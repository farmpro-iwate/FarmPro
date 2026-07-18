import { resetPassword } from './authStore';

function argument(name: string) {
  const args = process.argv.slice(2);
  const equalsPrefix = `--${name}=`;
  const equalsValue = args.find((item) => item.startsWith(equalsPrefix))?.slice(equalsPrefix.length).trim();
  if (equalsValue) return equalsValue;

  const index = args.indexOf(`--${name}`);
  const spacedValue = index >= 0 ? args[index + 1]?.trim() : '';
  if (spacedValue) return spacedValue;

  throw new Error(`MISSING_ARGUMENT:${name}`);
}

async function main() {
  const user = await resetPassword(argument('email'), argument('password'));
  console.log('パスワードを再設定しました。');
  console.log(`農場ID: ${user.farmId}`);
  console.log(`農場名: ${user.farmName}`);
  console.log(`利用者名: ${user.name}`);
  console.log(`メール: ${user.email}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`パスワードを再設定できませんでした: ${message}`);
  process.exitCode = 1;
});
