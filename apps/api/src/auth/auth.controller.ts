import { Body, Controller, Post } from "@nestjs/common";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";

class LoginBody {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  senha!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: LoginBody) {
    return this.authService.login(body.email, body.senha);
  }
}
