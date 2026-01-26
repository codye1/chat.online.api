import { OAuth2Client } from "google-auth-library";
import getEnv from "../utils/getEnv";

export const googleClient = new OAuth2Client(getEnv("GOOGLE_CLIENT_ID"));
