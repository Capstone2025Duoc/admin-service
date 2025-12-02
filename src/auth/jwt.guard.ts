import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

@Injectable()
export class JwtCookieGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();

    const token =
      (req.cookies && req.cookies.Authentication) ||
      req.headers['authorization']?.toString().replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('No authentication token');

    const pub = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (!pub) throw new UnauthorizedException('Public key not configured');

    try {
      const payload = jwt.verify(token, pub, { algorithms: ['RS256'] });
      // attach payload to request for controllers/services
      (req as any).user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

export default JwtCookieGuard;
