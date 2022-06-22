using IdentityModel.Client;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;
using System.Text.Json;
using TokenServer;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
}); 

builder.Services.AddHttpClient();
builder.Services.Configure<AuthRequestSettings>(builder.Configuration.GetSection("AuthRequest"));

builder.Services.AddCors(corsOptions =>
{
    corsOptions.AddPolicy("CorsPolicy", policy => policy
        .AllowAnyOrigin()
        .WithMethods("GET")
        );
});

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("CorsPolicy");
//app.UseHttpsRedirection();


app.MapGet("/token", async (IHttpClientFactory httpClientFactory, IOptions<AuthRequestSettings> authRequestSettings) =>
{
    var client = httpClientFactory.CreateClient();
    var response = await client.RequestClientCredentialsTokenAsync(new ClientCredentialsTokenRequest
    {
        Address = authRequestSettings.Value.TokenServerUrl,
        ClientId = authRequestSettings.Value.ClientId,
        ClientSecret = authRequestSettings.Value.ClientSecret,
        Scope = authRequestSettings.Value.Scope
    });

    return new TokenResponse(response.AccessToken, response.ExpiresIn);
})
.WithName("GetToken");

app.Run();

public readonly record struct TokenResponse(string AccessToken, int ExpiresIn);