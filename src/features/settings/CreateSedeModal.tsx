import { useState } from 'react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { sedesService } from '../../services/sedes.service';
import { getErrorMessage } from '../../lib/errors';
import type { SedeTelefono } from '../../types/database';
import Modal from '../../components/Modal';
import SedePhonesEditor from './SedePhonesEditor';
import { EMPTY_PHONE, cleanSedePhones } from './sedePhones';

interface CreateSedeModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateSedeModal({ onClose, onCreated }: CreateSedeModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const { refreshSedes } = useAuth();

  const [creatingSede, setCreatingSede] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');
  const [newSedeAddress, setNewSedeAddress] = useState('');
  const [newSedePhones, setNewSedePhones] = useState<SedeTelefono[]>([EMPTY_PHONE]);

  const handleCreateSede = async () => {
    if (!newSedeName.trim()) return;
    const phones = cleanSedePhones(newSedePhones);
    if (phones.error) {
      showToast('error', t(phones.error));
      return;
    }
    setCreatingSede(true);
    try {
      await sedesService.createSede({
        nombre: newSedeName.trim(),
        direccion: newSedeAddress.trim(),
        telefonos: phones.phones,
        capacidad: 10,
        color_tema: null,
        logo_url: null,
      });
      await refreshSedes();
      onCreated();
      showToast('success', t('settings.sedeCreated'));
      onClose();
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    } finally {
      setCreatingSede(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={t('settings.newWorkshop')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={handleCreateSede} disabled={creatingSede || !newSedeName.trim()}>
            {creatingSede ? t('common.loading') : t('common.create')}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label" htmlFor="new-sede-name">{t('settings.newSedeName')}</label>
        <input
          id="new-sede-name"
          className="form-input"
          value={newSedeName}
          onChange={(e) => setNewSedeName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="new-sede-address">{t('common.address')}</label>
        <input
          id="new-sede-address"
          className="form-input"
          placeholder={t('common.address')}
          value={newSedeAddress}
          onChange={(e) => setNewSedeAddress(e.target.value)}
        />
      </div>
      <SedePhonesEditor value={newSedePhones} onChange={setNewSedePhones} />
    </Modal>
  );
}
