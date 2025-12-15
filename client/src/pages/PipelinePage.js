import React, { useState, useEffect } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';
import { buildApiUrl } from '../config';

const PIPELINE_STAGES = [
  'New Quote',
  'Quoted',
  'Booked',
  'Pending',
  'In Transit',
  'Delivered',
  'Invoiced',
  'Paid'
];

function PipelineCard({ shipment }) {
  const originCity = shipment.shipper_location ? shipment.shipper_location.split(',')[0] : '-';
  const destCity = shipment.consignee_location ? shipment.consignee_location.split(',')[0] : '-';
  
  return (
    <div className="pipeline-card">
      <div className="pipeline-card-header">
        <span className="pipeline-card-id">{shipment.load_number}</span>
        <button className="pipeline-card-more">
          <MoreHorizontal size={14} />
        </button>
      </div>
      <h4 className="pipeline-card-customer">{shipment.customer}</h4>
      <div className="pipeline-card-route">
        <span className="pipeline-card-city">{originCity}</span>
        <span className="pipeline-card-arrow">→</span>
        <span className="pipeline-card-city">{destCity}</span>
      </div>
      <div className="pipeline-card-footer">
        <span className="pipeline-card-commodity">{shipment.description || shipment.type || '-'}</span>
        {shipment.rate && (
          <span className="pipeline-card-rate">${shipment.rate.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { user, checking, setUser } = useAuth();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShipments() {
      if (!user) return;
      try {
        const resp = await fetch(buildApiUrl('/api/loads'), { credentials: 'include' });
        const data = await resp.json();
        if (Array.isArray(data)) {
          setShipments(data);
        }
      } catch (e) {
        console.error('Failed to fetch shipments:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchShipments();
  }, [user]);

  const getShipmentsByStage = (stage) => {
    return shipments.filter(s => s.status === stage);
  };

  if (checking) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="app-loading">Checking session…</div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthed={(u) => setUser(u)} />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        {/* Decorative Background Blobs */}
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />
        
        <div className="pipeline-page">
          {/* Header */}
          <div className="pipeline-header">
            <div>
              <h1 className="pipeline-title">Pipeline</h1>
              <p className="pipeline-subtitle">Manage deal flow and shipment progress.</p>
            </div>
            <button className="btn">
              <Plus size={16} />
              New Deal
            </button>
          </div>

          {/* Pipeline Board */}
          <div className="pipeline-board-wrapper">
            <div className="pipeline-board">
              {PIPELINE_STAGES.map((stage) => {
                const items = getShipmentsByStage(stage);
                return (
                  <div key={stage} className="pipeline-column">
                    <div className="pipeline-column-header">
                      <h3 className="pipeline-column-title">
                        {stage}
                        <span className="pipeline-column-count">{items.length}</span>
                      </h3>
                      <button className="pipeline-column-add">
                        <Plus size={14} />
                      </button>
                    </div>
                    
                    <div className="pipeline-column-body">
                      {loading ? (
                        <div className="pipeline-empty">
                          <span>Loading...</span>
                        </div>
                      ) : items.length > 0 ? (
                        items.map(shipment => (
                          <PipelineCard key={shipment.id} shipment={shipment} />
                        ))
                      ) : (
                        <div className="pipeline-empty">
                          <span>No Shipments</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

