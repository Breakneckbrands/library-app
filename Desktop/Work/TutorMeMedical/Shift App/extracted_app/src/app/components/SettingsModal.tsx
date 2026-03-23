import { useState, useRef } from 'react';
import { X, Settings, Plus, Edit2, Trash2, Download, Upload } from 'lucide-react';
import { exportData, importData } from '@/utils/dataManager';

export interface NotificationPreferences {
  browser: boolean;
  audio: boolean;
  vibrate: boolean;
  visual: boolean;
  tabFlash: boolean;
}

export interface DocumentationItem {
  id: string;
  label: string;
  completed: boolean;
  subItems?: DocumentationItem[];
}

export interface AppSettings {
  notifications: NotificationPreferences;
  shiftStartHour: number;
  defaultDocs: DocumentationItem[];
  hourlyReminder: boolean;
}

function generateHourlySlots(startHour: number) {
  const slots = [];
  for (let i = 0; i < 14; i++) {
    const h24 = (startHour + i) % 24;
    const isPM = h24 >= 12;
    const h12 = h24 % 12 || 12;
    slots.push({ key: `${h12}${isPM ? 'P' : 'A'}`, label: `${h12} ${isPM ? 'PM' : 'AM'}` });
  }
  return slots;
}

interface SettingsModalProps {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(JSON.parse(JSON.stringify(settings)));
  const [activeTab, setActiveTab] = useState<'notifications' | 'shift' | 'docs' | 'backup'>('notifications');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await importData(file);
      } catch (error) {
        console.error('Import failed:', error);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" /> App Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 pt-2 bg-gray-50 overflow-x-auto">
          {[
            { id: 'notifications', label: 'Notifications' },
            { id: 'shift', label: 'Shift Setup' },
            { id: 'docs', label: 'Documentation' },
            { id: 'backup', label: 'Backup & Restore' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Notification Channels</h3>
              {(['browser', 'audio', 'vibrate', 'visual', 'tabFlash'] as const).map(key => (
                <label key={key} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                  <div>
                    <span className="font-semibold text-gray-700 capitalize">
                      {key.replace('tabFlash', 'Tab Flash')}
                    </span>
                    <p className="text-xs text-gray-500">
                      {key === 'browser' && 'OS-level popup notifications'}
                      {key === 'audio' && 'Alarm sounds and beeps'}
                      {key === 'vibrate' && 'Device vibration'}
                      {key === 'visual' && 'In-app toast messages'}
                      {key === 'tabFlash' && 'Tab title flashing'}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.notifications[key]}
                    onChange={e =>
                      setLocalSettings(s => ({
                        ...s,
                        notifications: { ...s.notifications, [key]: e.target.checked }
                      }))
                    }
                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
              ))}
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mt-6 mb-2">Features</h3>
              <label className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                <div>
                  <span className="font-semibold text-gray-700">Hourly Charting Reminder</span>
                  <p className="text-xs text-gray-500">Alerts every hour to update documentation</p>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.hourlyReminder}
                  onChange={e => setLocalSettings(s => ({ ...s, hourlyReminder: e.target.checked }))}
                  className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
              </label>
            </div>
          )}

          {activeTab === 'shift' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Shift Start Time</h3>
                <p className="text-xs text-gray-500 mb-3">Generates 14-hour grid starting from this time</p>
                <select
                  value={localSettings.shiftStartHour}
                  onChange={e => setLocalSettings(s => ({ ...s, shiftStartHour: parseInt(e.target.value) }))}
                  className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={6}>Day Shift (6:00 AM)</option>
                  <option value={7}>Day Shift (7:00 AM)</option>
                  <option value={18}>Night Shift (6:00 PM)</option>
                  <option value={19}>Night Shift (7:00 PM)</option>
                </select>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <h4 className="text-sm font-bold text-indigo-800 mb-2">Preview Slots:</h4>
                <div className="flex flex-wrap gap-2">
                  {generateHourlySlots(localSettings.shiftStartHour).map(s => (
                    <span key={s.key} className="text-xs bg-white px-2 py-1 rounded text-indigo-600 shadow-sm">
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Default Checklist</h3>
                  <p className="text-xs text-gray-500">Applies to all new rooms</p>
                </div>
                <button
                  onClick={() =>
                    setLocalSettings(s => ({
                      ...s,
                      defaultDocs: [...s.defaultDocs, { id: Date.now().toString(), label: 'New Item', completed: false }]
                    }))
                  }
                  className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-100 font-medium"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>

              <div className="space-y-3">
                {localSettings.defaultDocs.map((doc, idx) => (
                  <div key={doc.id} className="border border-gray-200 p-3 rounded-lg bg-gray-50">
                    <div className="flex gap-2 items-center">
                      <Edit2 className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={doc.label}
                        onChange={e => {
                          const newDocs = [...localSettings.defaultDocs];
                          newDocs[idx].label = e.target.value;
                          setLocalSettings(s => ({ ...s, defaultDocs: newDocs }));
                        }}
                        className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-sm font-semibold focus:outline-none focus:border-indigo-500"
                      />

                      <button
                        onClick={() => {
                          const newDocs = [...localSettings.defaultDocs];
                          if (!newDocs[idx].subItems) newDocs[idx].subItems = [];
                          newDocs[idx].subItems!.push({
                            id: Date.now().toString(),
                            label: 'Sub-item',
                            completed: false
                          });
                          setLocalSettings(s => ({ ...s, defaultDocs: newDocs }));
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 px-2 py-1 rounded bg-indigo-50"
                      >
                        + Sub
                      </button>
                      <button
                        onClick={() => {
                          const newDocs = [...localSettings.defaultDocs];
                          newDocs.splice(idx, 1);
                          setLocalSettings(s => ({ ...s, defaultDocs: newDocs }));
                        }}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {doc.subItems && doc.subItems.length > 0 && (
                      <div className="ml-6 mt-3 space-y-2 border-l-2 border-gray-200 pl-3">
                        {doc.subItems.map((sub, sIdx) => (
                          <div key={sub.id} className="flex gap-2 items-center">
                            <div className="w-2 h-2 rounded-full border border-gray-400 bg-white" />
                            <input
                              type="text"
                              value={sub.label}
                              onChange={e => {
                                const newDocs = [...localSettings.defaultDocs];
                                newDocs[idx].subItems![sIdx].label = e.target.value;
                                setLocalSettings(s => ({ ...s, defaultDocs: newDocs }));
                              }}
                              className="flex-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                            />
                            <button
                              onClick={() => {
                                const newDocs = [...localSettings.defaultDocs];
                                newDocs[idx].subItems!.splice(sIdx, 1);
                                setLocalSettings(s => ({ ...s, defaultDocs: newDocs }));
                              }}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-sm font-bold text-blue-900 mb-2">💾 Data Backup</h3>
                <p className="text-xs text-blue-800 mb-4">
                  Download a backup of all your settings and shift data. Store this file safely to restore your data later.
                </p>
                <button
                  onClick={() => exportData()}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" /> Download Backup
                </button>
              </div>

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="text-sm font-bold text-green-900 mb-2">♻️ Data Restore</h3>
                <p className="text-xs text-green-800 mb-4">
                  Upload a previously saved backup file to restore all your settings and shift data. The app will refresh after import.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Upload className="w-4 h-4" /> Upload Backup
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </div>

              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <h3 className="text-sm font-bold text-orange-900 mb-2">⚠️ Important</h3>
                <ul className="text-xs text-orange-800 space-y-1 list-disc list-inside">
                  <li>Backups are JSON files you can view with any text editor</li>
                  <li>This app stores all data locally — no cloud backup</li>
                  <li>Clearing browser cache will delete all app data</li>
                  <li>Create regular backups before clearing device storage</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* PHI Disclaimer */}
        <div className="bg-orange-50 px-6 py-3 border-t border-orange-100 flex items-start gap-3 text-xs text-orange-800">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <p className="mb-1">
              <strong>Data Privacy Warning:</strong> This app is fully offline. No data is stored in the cloud. You are strictly prohibited from entering Patient Health Information (PHI) pursuant to HIPAA regulations.
            </p>
            <a
              href="https://tutormemedical.com/app-privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-900 underline font-medium hover:text-orange-700"
            >
              Read our full Privacy Policy
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(localSettings)}
            className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
