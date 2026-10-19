const openSessions = new Map();

export function openTextFormattingSurface(sessionId, surfaceId) {
	if (sessionId == null) return;
	let surfaces = openSessions.get(sessionId);
	if (!surfaces) {
		surfaces = new Set();
		openSessions.set(sessionId, surfaces);
	}
	surfaces.add(surfaceId);
}

export function closeTextFormattingSurface(sessionId, surfaceId) {
	const surfaces = openSessions.get(sessionId);
	if (!surfaces) return;
	surfaces.delete(surfaceId);
	if (!surfaces.size) openSessions.delete(sessionId);
}

export function hasOpenTextFormattingSurface(sessionId) {
	return openSessions.has(sessionId);
}
