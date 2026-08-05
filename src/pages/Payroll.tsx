import { useLanguage } from '../context/LanguageContext';
import { mockPayroll, mockUsers, mockSedes } from '../services/mockData';
import { Plus, CreditCard, Calendar } from 'lucide-react';

export default function Payroll() {
  const { t } = useLanguage();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('payroll.title')}</h1>
          <p className="page-subtitle">{mockPayroll.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" id="new-payroll-btn">
          <Plus size={18} /> {t('payroll.newEntry')}
        </button>
      </div>

      <div className="table-container animate-fade-in">
        <table className="table">
          <thead>
            <tr>
              <th>{t('payroll.employee')}</th>
              <th>{t('payroll.periodStart')}</th>
              <th>{t('payroll.periodEnd')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.baseSalary')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.bonuses')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.deductions')}</th>
              <th style={{ textAlign: 'right' }}>{t('payroll.totalPaid')}</th>
              <th>{t('payroll.payDate')}</th>
            </tr>
          </thead>
          <tbody>
            {mockPayroll.map((entry) => {
              const user = mockUsers.find((u) => u.id === entry.usuario_id);
              return (
                <tr key={entry.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--color-bg-hover)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'var(--font-size-xs)', fontWeight: 700,
                        color: 'var(--color-primary-light)',
                      }}>
                        {user?.nombre_completo.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{user?.nombre_completo}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                          {user?.rol}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>{entry.periodo_inicio}</td>
                  <td style={{ fontSize: 'var(--font-size-sm)' }}>{entry.periodo_fin}</td>
                  <td style={{ textAlign: 'right' }}>${entry.salario_base.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>+${entry.bonos.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>-${entry.deducciones.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                    ${entry.total_pagado.toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
                      <Calendar size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                      {entry.fecha_pago}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Total {t('payroll.baseSalary')}
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
              ${mockPayroll.reduce((s, e) => s + e.salario_base, 0).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Total {t('payroll.totalPaid')}
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
              ${mockPayroll.reduce((s, e) => s + e.total_pagado, 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
