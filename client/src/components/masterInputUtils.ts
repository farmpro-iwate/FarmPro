type MasterNameOption = {
  name: string;
};

export function isUnregisteredMasterName(value: string, options: MasterNameOption[]): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return false;

  return !options.some(
    (option) => option.name.trim().toLocaleLowerCase() === normalized,
  );
}
