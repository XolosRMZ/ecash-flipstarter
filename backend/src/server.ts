import app from './app';
import { getEffectiveChronikBaseUrl } from './blockchain/ecashClient';
import { ECASH_BACKEND, USE_CHRONIK } from './config/ecash';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

app.listen(port, host, () => {
  if (process.env.NODE_ENV !== 'production') {
    const chronikBaseUrl = USE_CHRONIK ? getEffectiveChronikBaseUrl() : 'unused';
    console.log(
      `[config] backendMode=${ECASH_BACKEND} chronikBaseUrl=${chronikBaseUrl}`
    );
  }
  console.log(`Flipstarter backend listening on http://${host}:${port}`);
});
