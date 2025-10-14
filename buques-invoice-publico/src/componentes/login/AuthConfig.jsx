export const msalConfig = {
    auth: {
        clientId: "a04c669c-4ec8-4906-8916-f49e885fea1f",
        authority: "https://login.microsoftonline.com/93dfc24c-f409-43b0-92c9-f9e397506dcb",
        redirectUri: window.location.origin
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    }
};

export const loginRequest = {
  scopes: ["User.Read"],
  prompt: "select_account", // 🔑 fuerza que el usuario elija o escriba su cuenta
};