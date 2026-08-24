/** Authentication module for API key fallback and JWT sessions. */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiterService } from './login-rate-limiter.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, LoginRateLimiterService],
  exports: [AuthService],
})
export class AuthModule {}
