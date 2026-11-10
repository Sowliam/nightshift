type Seat = {
  identity: string;
  name: string;
  channelId: string;
  serverId: string;
  at: number;
};

const seats = new Map<string, Seat>();
const PRESENCE_TTL_MS = 3 * 60 * 1000;

export function enterVoice(input: {
  identity: string;
  name: string;
  channelId: string;
  serverId: string;
}) {
  for (const [id, seat] of seats) {
    if (id === input.identity || (seat.serverId === input.serverId && seat.identity === input.identity)) {
      seats.delete(id);
    }
  }
  seats.set(input.identity, { ...input, at: Date.now() });
}

export function leaveVoice(identity: string) {
  seats.delete(identity);
}

export function getVoice(identity: string): Seat | null {
  const seat = seats.get(identity);
  if (!seat) return null;
  if (Date.now() - seat.at > PRESENCE_TTL_MS) {
    seats.delete(identity);
    return null;
  }
  return seat;
}

export function listVoice(channelId: string) {
  const now = Date.now();
  const people: Array<{ identity: string; name: string; joinedAt: number }> = [];
  for (const [id, seat] of seats) {
    if (now - seat.at > PRESENCE_TTL_MS) {
      seats.delete(id);
      continue;
    }
    if (seat.channelId !== channelId) continue;
    people.push({ identity: seat.identity, name: seat.name, joinedAt: seat.at });
  }
  return people;
}

export function syncVoice(
  serverId: string,
  channelId: string,
  people: Array<{ identity: string; name: string }>,
) {
  const now = Date.now();
  const live = new Set<string>();
  for (const person of people) {
    const prev = seats.get(person.identity);
    if (prev && prev.channelId !== channelId && now - prev.at < 15000) {
      continue;
    }
    live.add(person.identity);
    seats.set(person.identity, {
      identity: person.identity,
      name: person.name || prev?.name || person.identity,
      channelId,
      serverId,
      at: now,
    });
  }
  for (const [id, seat] of seats) {
    if (seat.channelId !== channelId || live.has(id)) continue;
    if (now - seat.at < 8000) continue;
    seats.delete(id);
  }
}
