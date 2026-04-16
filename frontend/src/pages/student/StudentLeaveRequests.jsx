import { useState, useEffect } from 'react';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { 
  HiOutlineCalendar, 
  HiOutlineClipboardList, 
  HiOutlinePlus, 
  HiOutlineInformationCircle,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle
} from 'react-icons/hi';

const API_BASE = '/student'; // Base is already /api in our custom axios

export default function StudentLeaveRequests() {
  const [leaves, setLeaves] = useState([]);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    paper_id: '',
    reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leavesRes, summaryRes] = await Promise.all([
        api.get(`${API_BASE}/leave-requests`),
        api.get(`${API_BASE}/attendance`)
      ]);
      setLeaves(leavesRes.data);
      setPapers(summaryRes.data.map(p => ({ id: p.paper_id, name: p.paper_name, code: p.paper_code })));
    } catch (err) {
      setError('Failed to load leave records');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await api.post(`${API_BASE}/leave-requests`, formData);
      setSuccess('Your appeal has been submitted successfully.');
      setFormData({ start_date: '', end_date: '', paper_id: '', reason: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ height: '64vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <StatePanel variant="loading" title="Synchronizing" description="Loading your attendance appeals..." compact />
    </div>
  );

  return (
    <div className="leave-portal-wrapper">
      <div className="leave-portal-content">
        
        {/* Top Section: Form (Now strictly vertical) */}
        <section className="glass-panel main-form-panel">
          <div className="panel-header">
            <div className="header-icon-box">
              <HiOutlinePlus size={22} color="#fff" />
            </div>
            <div className="header-text">
              <h2>New Leave Appeal</h2>
              <p>Apply for medical or duty attendance credit</p>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit} className="vertical-form">
            <div className="form-row split">
              <div className="form-field">
                <label>START DATE</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>END DATE</label>
                <input
                  type="date"
                  required
                  value={formData.end_date}
                  onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="form-field">
              <label>AFFECTED PAPER</label>
              <select
                value={formData.paper_id}
                onChange={e => setFormData({ ...formData, paper_id: e.target.value })}
              >
                <option value="">All Enrolled Papers (Global Leave)</option>
                {papers.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>REASON FOR ABSENCE</label>
              <textarea
                required
                rows={4}
                value={formData.reason}
                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                placeholder="E.g. Medical emergency, family event, representing college in sports..."
              />
            </div>

            <button disabled={submitting} className="submit-button">
              {submitting ? 'Submitting Appeal...' : 'Submit Request'}
            </button>
          </form>

          <div className="info-footer">
            <HiOutlineInformationCircle size={18} className="info-icon" />
            <p>Appeals are subject to verification of physical evidence.</p>
          </div>
        </section>

        {/* Bottom Section: History */}
        <div className="history-section-wrapper">
          <div className="history-title">
            <HiOutlineClipboardList size={22} color="var(--accent-cyan)" />
            <h3>Your Appeal History</h3>
          </div>

          {leaves.length === 0 ? (
            <div className="glass-panel empty-logs">
              <HiOutlineClock size={40} opacity={0.3} />
              <p>No past requests found.</p>
            </div>
          ) : (
            <div className="vertical-timeline">
              {leaves.map((l, idx) => {
                const paper = papers.find(p => p.id === l.paper_id);
                return (
                  <div key={l._id} className={`timeline-card ${l.status}`}>
                    <div className="card-top">
                      <div className="status-indicator">
                        {l.status === 'approved' ? <HiOutlineCheckCircle /> : l.status === 'rejected' ? <HiOutlineXCircle /> : <HiOutlineClock />}
                        <span>{l.status.toUpperCase()}</span>
                      </div>
                      <span className="ref-id">REF: {l._id.slice(-6).toUpperCase()}</span>
                    </div>

                    <div className="card-details">
                      <h4>{l.paper_id ? `${paper?.code || 'Paper'}` : 'Global (All Papers)'}</h4>
                      <div className="date-badge">
                        <HiOutlineCalendar size={14} />
                        <span>{l.start_date === l.end_date ? l.start_date : `${l.start_date} to ${l.end_date}`}</span>
                      </div>
                      <p className="reason-bubble">"{l.reason}"</p>
                    </div>

                    {l.remark && (
                      <div className="admin-remark">
                        <span className="remark-label">Lecturer/Admin Remark:</span>
                        <p>{l.remark}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .leave-portal-wrapper {
          padding: 20px 0 60px;
          display: flex;
          justify-content: center;
        }
        .leave-portal-content {
          width: 100%;
          max-width: 650px; /* Force vertical focus */
          display: flex;
          flex-direction: column;
          gap: 40px;
        }
        .glass-panel {
          background: var(--bg-glass);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--border-glass);
          border-radius: 24px;
          box-shadow: var(--shadow-card);
          padding: 32px;
        }
        
        /* Header Fix */
        .panel-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }
        .header-icon-box {
          background: linear-gradient(135deg, #0ea5e9, #2dd4bf);
          padding: 10px;
          border-radius: 12px;
          display: flex;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
        }
        .header-text h2 { margin: 0; font-size: 1.4rem; font-weight: 850; color: var(--text-primary); }
        .header-text p { margin: 4px 0 0; font-size: 0.82rem; color: var(--text-muted); }

        /* Form Fix (Crucial) */
        .vertical-form {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .form-row.split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 500px) {
          .form-row.split { grid-template-columns: 1fr; }
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .form-field label {
          font-size: 0.72rem;
          font-weight: 800;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding-left: 2px;
        }
        .form-field input, .form-field select, .form-field textarea {
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-glass);
          border-radius: 14px;
          padding: 13px 16px;
          color: var(--text-primary);
          font-size: 0.95rem;
          outline: none;
          transition: all 0.2s ease;
          width: 100%;
        }
        .form-field input:focus, .form-field select:focus, .form-field textarea:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
          background: rgba(0, 0, 0, 0.25);
        }

        .submit-button {
          margin-top: 10px;
          padding: 15px;
          border-radius: 16px;
          background: linear-gradient(135deg, #0ea5e9, #2dd4bf);
          color: #fff;
          border: none;
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
          box-shadow: 0 10px 20px -5px rgba(14, 165, 233, 0.4);
          transition: all 0.2s ease;
        }
        .submit-button:hover { transform: translateY(-2px); box-shadow: 0 12px 25px -5px rgba(14, 165, 233, 0.5); }
        .submit-button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .info-footer {
          margin-top: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          background: rgba(14, 165, 233, 0.05);
          border-radius: 12px;
          border: 1px solid rgba(14, 165, 233, 0.1);
        }
        .info-footer p { font-size: 0.75rem; color: var(--text-muted); margin: 0; }
        .info-icon { color: #0ea5e9; }

        /* History Fix */
        .history-section-wrapper { display: flex; flex-direction: column; gap: 20px; }
        .history-title { display: flex; align-items: center; gap: 12px; padding: 0 10px; }
        .history-title h3 { font-size: 1.1rem; font-weight: 800; margin: 0; }
        
        .empty-logs { text-align: center; padding: 40px; color: var(--text-muted); }
        .empty-logs p { margin-top: 10px; font-weight: 500; font-size: 0.9rem; }

        .vertical-timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .timeline-card {
          background: var(--bg-glass);
          border: 1px solid var(--border-glass);
          border-radius: 18px;
          padding: 20px;
          transition: transform 0.2s ease;
        }
        .timeline-card:hover { transform: scale(1.01); }
        
        .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .status-indicator { display: flex; align-items: center; gap: 6px; font-weight: 900; font-size: 0.75rem; }
        .approved .status-indicator { color: #22c55e; }
        .rejected .status-indicator { color: #ef4444; }
        .pending .status-indicator { color: #eab308; }
        .ref-id { font-size: 0.65rem; font-weight: 700; opacity: 0.4; }

        .card-details h4 { font-size: 0.92rem; font-weight: 800; margin: 0 0 4px; }
        .date-badge { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px; }
        .reason-bubble { 
          font-size: 0.85rem; color: var(--text-secondary); background: rgba(0,0,0,0.1); 
          padding: 10px 14px; border-radius: 12px; margin: 0; line-height: 1.4;
        }

        .admin-remark { 
          margin-top: 14px; padding: 10px 14px; border-radius: 12px; 
          background: rgba(14,165,233,0.06); border-left: 3px solid #0ea5e9; 
        }
        .remark-label { font-size: 0.7rem; font-weight: 800; color: #0ea5e9; display: block; margin-bottom: 2px; }
        .admin-remark p { font-size: 0.8rem; margin: 0; color: var(--text-primary); }

        .alert { padding: 12px 16px; border-radius: 12px; margin-bottom: 24px; font-size: 0.85rem; border: 1px solid transparent; }
        .alert-error { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2); }
        .alert-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border-color: rgba(34, 197, 94, 0.2); }
      `}</style>
    </div>
  );
}
