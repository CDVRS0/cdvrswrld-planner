import { checked } from './cloud.js';

export async function updateCloudAction(client, owner, task, changes) {
  const rows = await checked(client.from('planner_tasks').update({ ...changes, updated_at: new Date().toISOString() })
    .eq('user_id', owner).eq('id', task.id).eq('updated_at', task.updated_at).eq('status', task.status).select('id'));
  if (!rows.length) throw new Error('This task changed on another device. Refresh and review it again.');
}
