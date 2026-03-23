import { toast } from 'sonner';

export interface BackupData {
  version: string;
  exportedAt: string;
  appSettings: unknown;
  shiftData: unknown;
}

export function exportData(): void {
  try {
    const appSettings = localStorage.getItem('appSettings');
    const shiftData = localStorage.getItem('shiftData');

    const backup: BackupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      appSettings: appSettings ? JSON.parse(appSettings) : null,
      shiftData: shiftData ? JSON.parse(shiftData) : null,
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shift-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Backup downloaded successfully');
  } catch (error) {
    console.error('Export failed:', error);
    toast.error('Failed to export backup');
  }
}

export function importData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup: BackupData = JSON.parse(e.target?.result as string);

        if (backup.version !== '1.0') {
          throw new Error('Invalid backup version');
        }

        if (backup.appSettings) {
          localStorage.setItem('appSettings', JSON.stringify(backup.appSettings));
        }
        if (backup.shiftData) {
          localStorage.setItem('shiftData', JSON.stringify(backup.shiftData));
        }

        toast.success('Data restored successfully');
        setTimeout(() => window.location.reload(), 500);
        resolve();
      } catch (error) {
        console.error('Import failed:', error);
        toast.error('Failed to import backup file');
        reject(error);
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read file');
      reject(new Error('File read error'));
    };
    reader.readAsText(file);
  });
}
