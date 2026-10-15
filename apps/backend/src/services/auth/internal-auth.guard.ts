import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// Application identity is local. Social channel OAuth uses separate controllers.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const route = String(request.route?.path || request.path || '');
    if (
      /\/auth\/(oauth|farcaster)/.test(route) ||
      (request.body?.provider !== undefined &&
        request.body.provider !== 'LOCAL') ||
      Boolean(request.body?.providerToken)
    ) {
      throw new ForbiddenException(
        'This internal application supports email and password login only'
      );
    }
    return true;
  }
}
