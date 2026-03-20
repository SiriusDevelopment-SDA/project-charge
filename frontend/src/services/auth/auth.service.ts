import { Api } from "../api";
import { getErrorStatus } from "../../utils/error";

type LoginPayload = {
  email: string;
  password: string;
};

type EmbedLoginPayload = {
  account: string;
  token: string;
};

type LoginResponse = {
  success: boolean;
  accessToken: string;
  company: {
    id: string;
    name: string;
    account: string;
  };
  agent?: {
    id: string;
    name: string | null;
  } | null;
};

type MeResponse = {
  success: boolean;
  company: {
    id: string;
    name: string;
    account: string;
    cnpj: string;
  };
  agent?: {
    id: string;
    name: string | null;
  } | null;
};

export class AuthService {
  static async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await Api.post<LoginResponse>("/auth/login", payload);
    return data;
  }

  static async embedLogin(payload: EmbedLoginPayload): Promise<LoginResponse> {
    try {
      const { data } = await Api.post<LoginResponse>("/auth/embed-login", payload);
      return data;
    } catch (error: unknown) {
      const status = getErrorStatus(error);
      if (status === 404) {
        // Compatibilidade com backend legado que ainda usa /auth/login (account+token).
        const { data } = await Api.post<LoginResponse>("/auth/login", payload);
        return data;
      }

      throw error;
    }
  }

  static async me(): Promise<MeResponse> {
    const { data } = await Api.get<MeResponse>("/auth/me");
    return data;
  }
}
