import { ConfigService } from '@nestjs/config';
import { LoginRateLimiterService } from './login-rate-limiter.service';

describe('LoginRateLimiterService', () => {
  const createService = (
    values: Record<string, string | number> = {},
  ): LoginRateLimiterService =>
    new LoginRateLimiterService({
      get: (key: string) => values[key],
    } as ConfigService);

  it('locks after the configured number of failures', () => {
    const service = createService({
      WEBUI_LOGIN_MAX_FAILURES: 3,
      WEBUI_LOGIN_FAILURE_WINDOW_SECONDS: 60,
      WEBUI_LOGIN_LOCK_SECONDS: 120,
    });

    expect(service.recordFailure(1_000).allowed).toBe(true);
    expect(service.recordFailure(2_000).allowed).toBe(true);
    expect(service.recordFailure(3_000)).toEqual({
      allowed: false,
      retryAfter: 120,
    });
    expect(service.check(3_500)).toEqual({
      allowed: false,
      retryAfter: 120,
    });
  });

  it('allows attempts after the lock expires', () => {
    const service = createService({
      WEBUI_LOGIN_MAX_FAILURES: 2,
      WEBUI_LOGIN_LOCK_SECONDS: 10,
    });

    service.recordFailure(1_000);
    service.recordFailure(2_000);

    expect(service.check(11_999).allowed).toBe(false);
    expect(service.check(12_000)).toEqual({
      allowed: true,
      retryAfter: 0,
    });
  });

  it('drops failures outside the configured window', () => {
    const service = createService({
      WEBUI_LOGIN_MAX_FAILURES: 2,
      WEBUI_LOGIN_FAILURE_WINDOW_SECONDS: 10,
    });

    service.recordFailure(1_000);
    expect(service.recordFailure(11_001).allowed).toBe(true);
  });

  it('clears failures after a successful login', () => {
    const service = createService({ WEBUI_LOGIN_MAX_FAILURES: 2 });

    service.recordFailure(1_000);
    service.recordSuccess();

    expect(service.recordFailure(2_000).allowed).toBe(true);
  });
});
