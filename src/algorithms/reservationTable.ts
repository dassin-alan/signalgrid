import { Coordinate, coordKey } from '../domain/coordinates';

export interface ReservationTable {
  vertexReservations: Map<number, Set<string>>;
  edgeReservations: Map<number, Set<string>>;
}

export function createReservationTable(): ReservationTable {
  return {
    vertexReservations: new Map(),
    edgeReservations: new Map(),
  };
}

export function addVertexReservation(
  table: ReservationTable,
  tick: number,
  coord: Coordinate
): void {
  const key = coordKey(coord);
  if (!table.vertexReservations.has(tick)) {
    table.vertexReservations.set(tick, new Set());
  }
  table.vertexReservations.get(tick)!.add(key);
}

export function addEdgeReservation(
  table: ReservationTable,
  tick: number,
  from: Coordinate,
  to: Coordinate
): void {
  const edgeKey = `${coordKey(from)}->${coordKey(to)}`;
  if (!table.edgeReservations.has(tick)) {
    table.edgeReservations.set(tick, new Set());
  }
  table.edgeReservations.get(tick)!.add(edgeKey);
}

export function isVertexReserved(
  table: ReservationTable,
  tick: number,
  coord: Coordinate
): boolean {
  const set = table.vertexReservations.get(tick);
  return set ? set.has(coordKey(coord)) : false;
}

export function isEdgeReserved(
  table: ReservationTable,
  tick: number,
  from: Coordinate,
  to: Coordinate
): boolean {
  const set = table.edgeReservations.get(tick);
  if (!set) return false;
  return set.has(`${coordKey(from)}->${coordKey(to)}`);
}
