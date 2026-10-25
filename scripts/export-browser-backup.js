// Run in the original Planner page's developer console. Download only.
(() => {
  const raw = localStorage.getItem('cdvrs_planner_v5');
  if (!raw) throw new Error('No saved Planner data in this browser.');
  const parsed = JSON.parse(raw);
  if (!parsed.weeks) throw new Error('Unrecognized Planner data.');
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cdvrs-planner-backup-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
