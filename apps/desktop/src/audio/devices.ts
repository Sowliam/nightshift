/** Pick the real device behind Chrome's "default" / "communications" entries. */
export function concreteDeviceId(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceInfo['kind'],
  savedId: string | undefined,
): string {
  const list = devices.filter((d) => d.kind === kind && d.deviceId);
  const saved = savedId || '';
  if (
    saved &&
    saved !== 'default' &&
    saved !== 'communications' &&
    list.some((d) => d.deviceId === saved)
  ) {
    return saved;
  }

  const communications = list.find((d) => d.deviceId === 'communications');
  const systemDefault = list.find((d) => d.deviceId === 'default');
  const anchor = communications || systemDefault;
  if (anchor?.groupId) {
    const match = list.find(
      (d) =>
        d.deviceId !== 'default' &&
        d.deviceId !== 'communications' &&
        d.groupId === anchor.groupId,
    );
    if (match) return match.deviceId;
  }

  const real = list.find((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
  return real?.deviceId || '';
}
