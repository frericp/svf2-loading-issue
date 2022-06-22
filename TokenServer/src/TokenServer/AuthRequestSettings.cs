namespace TokenServer
{
    public class AuthRequestSettings
    {
        public string TokenServerUrl { get; set; } = "https://developer.api.autodesk.com/authentication/v1/authenticate";
        public string? ClientId { get; set; }
        public string? ClientSecret { get; set; }
        public string Scope { get; set; } = "viewables:read";
    }
}
