import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { 
  HiOutlineCheck, 
  HiOutlineX, 
  HiOutlineUserCircle,
  HiOutlineCalendar,
  HiOutlineDocumentReport,
  HiOutlineShieldCheck
} from 'react-icons/hi';

const API_BASE = '/admin'; // api prefix is handled by axios instance

export default function ManageLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [remark, setRemark] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    try {
      const res = await api.get(`${API_BASE}/leave-requests`);
      setLeaves(res.data);
    } catch (err) {
      setError('Failed to fetch leave records');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    setProcessingId(id);
    try {
      await api.put(`${API_BASE}/leave-requests/${id}/${action}`, {
        remark: remark[id] || ''
      });
      fetchLeaves();
    } catch (err) {
      toast.error('Action failed: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return (
    <div style={{ height: '64vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <StatePanel variant="loading" title="Admin Hub" description="Analyzing student appeals..." compact />
    </div>
  );

  const pending = leaves.filter(l => l.status === 'pending');
  const history = leaves.filter(l => l.status !== 'pending');

  return (
    <div className="admin-leave-wrapper">
      <div className="admin-leave-content">
        
        {/* Header Summary */}
        <div className="admin-header">
          <div className="title-section">
            <h1>Leave Requests</h1>
            <p>Manage and audit student attendance appeals</p>
          </div>
          <div className="admin-stats">
            <div className="stat-box active">
              <span className="stat-label">PENDING</span>
              <span className="stat-val">{pending.length}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">HANDLED</span>
              <span className="stat-val">{history.length}</span>
            </div>
          </div>
        </div>

        {error && <div className="admin-alert">{error}</div>}

        {/* Pending Appeals - Vertical List */}
        <section className="admin-pending-section">
          <div className="section-label">
            <HiOutlineShieldCheck size={20} color="var(--accent-cyan)" />
            <h3>Awaiting Review</h3>
          </div>

          {pending.length === 0 ? (
            <div className="glass-panel empty-admin">
              <HiOutlineCheck size={40} color="var(--accent-emerald)" />
              <p>No pending requests to process.</p>
            </div>
          ) : (
            <div className="admin-vertical-list">
              {pending.map(l => (
                <div key={l._id} className="glass-panel decision-card">
                  <div className="decision-header">
                    <div className="admin-user-info">
                      <div className="admin-avatar">
                        <HiOutlineUserCircle size={24} />
                      </div>
                      <div>
                        <h4>{l.student_name}</h4>
                        <p>{l.student_email}</p>
                      </div>
                    </div>
                    {l.paper_id ? (
                      <span className="type-badge paper">{l.paper_code}</span>
                    ) : (
                      <span className="type-badge global">GLOBAL</span>
                    )}
                  </div>

                  <div className="decision-details">
                    <div className="detail-meta">
                      <HiOutlineCalendar />
                      <span>{l.start_date === l.end_date ? l.start_date : `${l.start_date} to ${l.end_date}`}</span>
                    </div>
                    {l.paper_id && <p className="detail-sub">{l.paper_name}</p>}
                    <div className="decision-reason">
                      <p>"{l.reason}"</p>
                    </div>
                  </div>

                  <div className="decision-footer">
                    <input
                      placeholder="Feedback/Reason for the student..."
                      value={remark[l._id] || ''}
                      onChange={e => setRemark({ ...remark, [l._id]: e.target.value })}
                    />
                    <div className="decision-buttons">
                      <button 
                        onClick={() => handleAction(l._id, 'approve')}
                        disabled={processingId === l._id}
                        className="btn-approve-new"
                      >
                        <HiOutlineCheck /> Approve
                      </button>
                      <button 
                        onClick={() => handleAction(l._id, 'reject')}
                        disabled={processingId === l._id}
                        className="btn-reject-new"
                      >
                        <HiOutlineX /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History Log - Vertical Table */}
        <section className="admin-history-section">
          <div className="section-label">
            <div className="accent-dot" />
            <h3>Historical Decisions</h3>
          </div>
          
          <div className="glass-panel log-panel">
            <div className="log-scroll">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(l => (
                    <tr key={l._id}>
                      <td>
                        <div className="log-user">
                          <span className="nm">{l.student_name}</span>
                          <span className="em">{l.student_email}</span>
                        </div>
                      </td>
                      <td className="log-dates">
                        {l.start_date === l.end_date ? l.start_date : `${l.start_date} to ${l.end_date}`}
                        {l.paper_id && <span className="p-tag">{l.paper_code}</span>}
                      </td>
                      <td>
                        <span className={`log-pill ${l.status}`}>{l.status.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="3" style={{ padding: 40, textAlign: 'center', opacity: 0.4 }}>No logs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .admin-leave-wrapper { padding: 20px 0 60px; display: flex; justify-content: center; }
        .admin-leave-content { width: 100%; max-width: 700px; display: flex; flex-direction: column; gap: 40px; }

        .admin-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 10px; }
        .title-section h1 { font-size: 1.8rem; font-weight: 850; margin: 0; color: var(--text-primary); }
        .title-section p { font-size: 0.9rem; color: var(--text-muted); margin: 6px 0 0; }
        .admin-stats { display: flex; gap: 12px; }
        .stat-box { 
          background: var(--bg-glass); border: 1px solid var(--border-glass); 
          padding: 8px 16px; border-radius: 12px; text-align: center; min-width: 80px;
        }
        .stat-box.active { border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.05); }
        .stat-label { display: block; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); }
        .active .stat-label { color: #0ea5e9; }
        .stat-val { font-size: 1.2rem; font-weight: 900; }

        .glass-panel {
          background: var(--bg-glass); backdrop-filter: blur(16px);
          border: 1px solid var(--border-glass); border-radius: 20px; padding: 24px;
        }
        .section-label { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding: 0 10px; }
        .section-label h3 { font-size: 1rem; font-weight: 800; margin: 0; }
        .accent-dot { width: 4px; height: 18px; background: #0ea5e9; border-radius: 4px; }

        .admin-vertical-list { display: flex; flex-direction: column; gap: 20px; }
        .decision-card { box-shadow: var(--shadow-card); }
        .decision-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
        .admin-user-info { display: flex; gap: 14px; align-items: center; }
        .admin-avatar { width: 40px; height: 40px; border-radius: 10px; background: rgba(0,0,0,0.1); border: 1px solid var(--border-glass); display: flex; align-items: center; justify-content: center; }
        .admin-user-info h4 { margin: 0; font-size: 1rem; font-weight: 800; }
        .admin-user-info p { margin: 2px 0 0; font-size: 0.75rem; color: var(--text-muted); }
        
        .type-badge { font-size: 0.65rem; font-weight: 900; padding: 4px 10px; border-radius: 8px; }
        .type-badge.paper { background: rgba(255,255,255,0.05); color: var(--text-muted); }
        .type-badge.global { background: rgba(14,165,233,0.12); color: #0ea5e9; }

        .decision-details { background: rgba(0,0,0,0.15); padding: 16px; border-radius: 16px; margin-bottom: 20px; border: 1px solid var(--border-glass); }
        .detail-meta { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 700; margin-bottom: 4px; }
        .detail-sub { margin: 0 0 10px; font-size: 0.75rem; color: var(--text-muted); padding-left: 22px; }
        .decision-reason { color: var(--text-secondary); font-size: 0.9rem; font-style: italic; line-height: 1.4; }

        .decision-footer { display: flex; flex-direction: column; gap: 14px; }
        .decision-footer input { padding: 12px; border-radius: 12px; border: 1px solid var(--border-glass); background: rgba(0,0,0,0.1); color: var(--text-primary); outline: none; font-size: 0.85rem; }
        .decision-buttons { display: flex; gap: 10px; }
        .decision-buttons button { 
          flex: 1; padding: 12px; border-radius: 12px; border: none; font-weight: 850; font-size: 0.88rem; 
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; color: #fff;
        }
        .btn-approve-new { background: #10b981; }
        .btn-reject-new { background: #ef4444; }

        .log-panel { padding: 0; overflow: hidden; }
        .log-scroll { overflow-x: auto; }
        .log-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .log-table th { padding: 16px 20px; text-align: left; font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border-glass); }
        .log-table td { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .log-user .nm { display: block; font-weight: 750; color: var(--text-primary); }
        .log-user .em { font-size: 0.75rem; color: var(--text-muted); }
        .log-dates { font-weight: 500; }
        .p-tag { margin-left: 8px; font-weight: 800; color: #0ea5e9; }
        .log-pill { padding: 5px 12px; border-radius: 99px; font-size: 0.72rem; font-weight: 900; }
        .log-pill.approved { background: rgba(34,197,94,0.1); color: #22c55e; }
        .log-pill.rejected { background: rgba(239,68,68,0.1); color: #ef4444; }

        .admin-alert { padding: 14px; background: rgba(239,68,68,0.1); color: #ef4444; border-radius: 14px; text-align: center; font-weight: 600; }
      `}</style>
    </div>
  );
}
