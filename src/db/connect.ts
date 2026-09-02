import net from 'node:net'

/**
 * What every client in this repository shares, and the one setting that has to
 * be made before any of them opens a socket.
 *
 * Node 22 races the addresses a host resolves to and gives each one
 * `autoSelectFamilyAttemptTimeout` to complete its handshake -- **250 ms** by
 * default. The handshake to Neon's `us-east-2` pooler measures 208-311 ms from
 * Argentina, so the default sits inside the jitter rather than outside it: when
 * a round trip lands on the wrong side of 250 ms, Node abandons each of the six
 * addresses in turn and throws `AggregateError [ETIMEDOUT]`, one error per
 * address. Measured before changing anything: **7 failures in 12** fresh
 * connections. At 2 s: **0 in 12**, and the median successful connection halves,
 * from 5190 ms to 2527 ms, because it stops cycling through addresses first.
 *
 * The host resolves to IPv4 only, so the race this timeout governs has nothing
 * to win here in the first place. The cost of the larger value is paid only when
 * an address is genuinely dead, where giving up takes longer -- the right trade
 * for a panel that would otherwise refuse a real administrator.
 *
 * ponytail: a process-wide Node default, set from a module. It is what the
 * setting is -- one per process, before the first socket -- and importing this
 * module is what every client already has to do for its options.
 */
net.setDefaultAutoSelectFamilyAttemptTimeout(2000)

/**
 * Neon's pooled connection string wants both: PgBouncer in transaction mode
 * cannot hold prepared statements, and a serverless instance has no use for a
 * pool of its own. `tools/seed.ts` overrides `max`, which is why this spreads
 * rather than being passed whole.
 */
export const POSTGRES_OPTIONS = { max: 1, prepare: false } as const
