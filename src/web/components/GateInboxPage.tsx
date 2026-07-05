import React, { useCallback, useEffect, useState } from 'react';
import type { GateEvent } from '../../core/gate-event-store';
import { apiClient } from '../lib/api';
import LoadingSpinner from './LoadingSpinner';

/**
 * Read-only view over the GateEvent log (BACK-605.10).
 *
 * Data source is `GET /api/gate-events`, which forwards to the same
 * `runGateLogQuery` used by `engine gate-log` (src/engine/gate-log.ts) and
 * the `inbox` operation skill (BACK-605.9) — this page never re-implements
 * the query/filter logic itself.
 *
 * Scope: read-only observability only. No multi-lane view, no auth, no
 * interactive gate-review submission — those are BACK-604.
 */
const GateInboxPage: React.FC = () => {
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pipelineId, setPipelineId] = useState('');
  const [gate, setGate] = useState('');
  const [actor, setActor] = useState('');
  const [since, setSince] = useState('');

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.fetchGateEvents({
        pipelineId: pipelineId.trim() || undefined,
        gate: gate.trim() || undefined,
        actor: actor.trim() || undefined,
        since: since.trim() || undefined,
      });
      setEvents(data);
    } catch (err) {
      console.error('Failed to load gate events:', err);
      setError('Failed to load gate events');
    } finally {
      setLoading(false);
    }
  }, [pipelineId, gate, actor, since]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadEvents();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Gate Inbox</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Read-only view of the GateEvent log. Filter by pipeline, gate, actor, or a start timestamp.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Pipeline ID"
          value={pipelineId}
          onChange={(e) => setPipelineId(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          placeholder="Gate"
          value={gate}
          onChange={(e) => setGate(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          placeholder="Actor"
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          placeholder="Since (ISO 8601)"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors duration-200"
        >
          Apply filters
        </button>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {!loading && error && (
        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No gate events match the current filters.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Timestamp</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Pipeline</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Item</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Gate</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Actor</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.timestamp}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.pipeline_id}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.item_id}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.gate}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.actor}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{event.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default GateInboxPage;
