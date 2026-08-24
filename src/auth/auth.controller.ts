/** REST controller for JWT login/logout flows. */
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-codes';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import { AuthService } from './auth.service';
import { LoginRequestDto, LoginResponseDto } from './dto/auth.dto';
import {
  LoginRateLimiterService,
  type LoginRateLimitDecision,
} from './login-rate-limiter.service';
import { Public } from './public.decorator';

function getRequestId(request: FastifyRequest): string | undefined {
  const id = (request as unknown as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginRateLimiter: LoginRateLimiterService,
  ) {}

  /** Exchanges the deployment API key for a short-lived JWT. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Login with the WebUI API key' })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    const requestId = getRequestId(request);
    this.enforceLoginRateLimit(this.loginRateLimiter.check(), reply, requestId);

    if (!this.authService.validateApiKey(body.apiKey)) {
      const decision = this.loginRateLimiter.recordFailure();
      this.authService.logAuthEvent('warn', {
        authType: 'apiKeyLogin',
        reason: decision.allowed ? 'invalidApiKey' : 'rateLimitTriggered',
        requestId,
      });
      this.enforceLoginRateLimit(decision, reply, requestId);
      throw BusinessException.unauthorized(
        ErrorCode.auth.invalidApiKey,
        'Invalid API key',
      );
    }

    this.loginRateLimiter.recordSuccess();
    this.authService.logAuthEvent('log', {
      authType: 'apiKeyLogin',
      reason: 'loginSuccess',
      requestId,
    });
    return this.authService.signJwt();
  }

  /** Stateless logout; the browser clears the stored JWT. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Logout the current WebUI session' })
  @ApiNoContentResponse()
  logout(): void {}

  private enforceLoginRateLimit(
    decision: LoginRateLimitDecision,
    reply: FastifyReply,
    requestId?: string,
  ): void {
    if (decision.allowed) return;

    reply.header('Retry-After', String(decision.retryAfter));
    this.authService.logAuthEvent('warn', {
      authType: 'apiKeyLogin',
      reason: 'rateLimited',
      requestId,
    });
    throw BusinessException.tooManyRequests(
      ErrorCode.auth.rateLimited,
      'Too many failed login attempts',
      { retryAfter: decision.retryAfter },
    );
  }
}
