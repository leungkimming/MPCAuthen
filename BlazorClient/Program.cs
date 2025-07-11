using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using BlazorApp;
using MudBlazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddTransient<CredentialsMessageHandler>();
builder.Services.AddMudServices();

builder.Services.AddScoped(sp =>
    new HttpClient(
        new CredentialsMessageHandler {
            InnerHandler = new HttpClientHandler()
        }
    ) 
);
await builder.Build().RunAsync();
