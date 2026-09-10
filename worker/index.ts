import vinext from 'vinext/server/fetch-handler';

type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
};

function berlinHour(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export default {
  fetch(request, env, context) {
    return vinext.fetch(request, env, context);
  },
  async scheduled(controller, env, context) {
    // The trigger runs hourly so daylight-saving time is handled in Berlin time.
    if (berlinHour(new Date(controller.scheduledTime)) !== '20') return;
    const response = await vinext.fetch(
      new Request(
        'https://formpoesie-masterbrain.internal/api/designer-monitor?scheduled=1',
        { method: 'POST' },
      ),
      env,
      context,
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        result.error || `Automatische Designer-Prüfung: Status ${response.status}`,
      );
    }
  },
} satisfies ExportedHandler<Bindings>;
