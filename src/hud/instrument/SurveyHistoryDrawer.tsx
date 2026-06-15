// Phenotyping — Survey History Drawer.
//
// Right-side slide-in like SettingsDrawer.  Lists saved SurveyRecords from
// IndexedDB.  Click row → opens SurveyResultSheet.  Per-row: Export, Delete.

import { useEffect, useState } from 'react';
import { useTwinStore } from '../../state/twinStore';
import { surveyStore, downloadBlob, type SurveyRecordSummary } from '../../scenarios/phenotyping/surveyStore';

export function SurveyHistoryDrawer() {
  const open = useTwinStore((s) => s.historyDrawerOpen);
  const setOpen = useTwinStore((s) => s.setHistoryDrawerOpen);
  const setViewingSurveyId = useTwinStore((s) => s.setViewingSurveyId);
  const lastSurveyId = useTwinStore((s) => s.lastSurveyId);

  const [records, setRecords] = useState<SurveyRecordSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    surveyStore.list()
      .then((rs) => setRecords(rs))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
    // Re-fetch when lastSurveyId changes (new completion)
  }, [open, lastSurveyId]);

  function onView(id: string) {
    setViewingSurveyId(id);
    setOpen(false);
  }

  function onExport(e: React.MouseEvent, id: string, scenarioId: string, day: number) {
    e.stopPropagation();
    surveyStore.exportJSON(id).then((blob) => {
      downloadBlob(blob, `phytosim-survey-${scenarioId}-d${day}-${id.slice(0, 8)}.json`);
    });
  }

  function onDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm(`Delete survey ${id.slice(0, 8)}?`)) return;
    surveyStore.delete(id).then(() => {
      setRecords((prev) => prev.filter((r) => r.id !== id));
    });
  }

  function onImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const file = inp.files?.[0];
      if (!file) return;
      surveyStore.importJSON(file)
        .then(() => surveyStore.list().then(setRecords))
        .catch((err) => alert(`Import failed: ${err.message ?? err}`));
    };
    inp.click();
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s',
          zIndex: 1190,
        }}
      />
      <aside style={{
        ...drawerS,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
      }}>
        <div style={headRowS}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Survey History</span>
          <button style={closeBtnS} onClick={() => setOpen(false)} aria-label="close">×</button>
        </div>

        <div style={subBarS}>
          <span className="iw-mono" style={{ fontSize: 10, color: 'var(--iw-fg-mute)' }}>
            {records.length} record{records.length === 1 ? '' : 's'}
          </span>
          <div style={{ flex: 1 }} />
          <button style={smallBtnS} onClick={onImport}>Import JSON</button>
        </div>

        <div style={listS}>
          {loading && <div style={emptyS}>Loading…</div>}
          {!loading && records.length === 0 && (
            <div style={emptyS}>
              No saved surveys yet.<br />
              <span style={{ color: 'var(--iw-fg-faint)' }}>Run a phenotyping survey from the robot transport dock.</span>
            </div>
          )}
          {!loading && records.map((r) => {
            const date = new Date(r.startedAt);
            const statusColor = r.status === 'completed' ? 'var(--iw-ok)' : r.status === 'aborted' ? 'var(--iw-err)' : 'var(--iw-warn)';
            return (
              <div
                key={r.id}
                onClick={() => onView(r.id)}
                style={rowS}
                role="button"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span className="iw-mono" style={{ fontSize: 11, color: 'var(--iw-fg-hi)' }}>
                    {r.scenarioId}
                  </span>
                  <span className="iw-mono" style={{ fontSize: 10, color: statusColor, fontWeight: 600 }}>
                    {r.status}
                  </span>
                </div>
                <div className="iw-mono" style={{ fontSize: 10, color: 'var(--iw-fg-mute)', display: 'flex', gap: 10 }}>
                  <span>d{r.cropDay}</span>
                  <span>{r.cropSeed}</span>
                  <span style={{ color: 'var(--iw-accent)' }}>{r.totals.fruitCount}f</span>
                </div>
                <div className="iw-mono" style={{ fontSize: 9, color: 'var(--iw-fg-faint)', marginTop: 3 }}>
                  detector: {r.detectorLabel}
                </div>
                <div className="iw-mono" style={{ fontSize: 9, color: 'var(--iw-fg-faint)', marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{date.toLocaleString()}</span>
                  <span>{(r.elapsedMs / 1000).toFixed(0)}s</span>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  <button onClick={(e) => onExport(e, r.id, r.scenarioId, r.cropDay)} style={miniBtnS}>Export</button>
                  <button onClick={(e) => onDelete(e, r.id)} style={miniBtnDangerS}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

const drawerS: React.CSSProperties = {
  position: 'fixed',
  top: 46,
  right: 0,
  bottom: 0,
  width: 340,
  background: '#0c0f12',
  borderLeft: '1px solid var(--iw-line-2)',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.28s ease',
  boxShadow: '-16px 0 40px rgba(0,0,0,0.45)',
  zIndex: 1200,
  fontFamily: 'var(--iw-font-ui)',
  color: 'var(--iw-fg-hi)',
};

const headRowS: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 16px 14px',
  borderBottom: '1px solid var(--iw-line-1)',
};

const closeBtnS: React.CSSProperties = {
  color: 'var(--iw-fg-mute)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
};

const subBarS: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 16px',
  borderBottom: '1px solid var(--iw-line-1)',
};

const listS: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
};

const emptyS: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  color: 'var(--iw-fg-mute)',
  fontSize: 12,
  lineHeight: 1.6,
};

const rowS: React.CSSProperties = {
  background: 'var(--iw-bg-2)',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 6,
  padding: '10px 11px',
  marginBottom: 6,
  cursor: 'pointer',
};

const smallBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 10,
  color: 'var(--iw-fg-mid)',
  background: 'transparent',
  border: '1px solid var(--iw-line-2)',
  borderRadius: 4,
  padding: '3px 8px',
  cursor: 'pointer',
};

const miniBtnS: React.CSSProperties = {
  fontFamily: 'var(--iw-font-mono)',
  fontSize: 9,
  color: 'var(--iw-fg-dim)',
  background: 'transparent',
  border: '1px solid var(--iw-line-1)',
  borderRadius: 3,
  padding: '2px 6px',
  cursor: 'pointer',
};

const miniBtnDangerS: React.CSSProperties = {
  ...miniBtnS,
  color: 'var(--iw-err)',
  borderColor: 'rgba(240,88,76,0.3)',
};
