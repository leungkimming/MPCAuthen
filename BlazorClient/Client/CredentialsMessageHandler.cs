using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Components.WebAssembly.Http;

public class CredentialsMessageHandler : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (request.RequestUri.AbsolutePath.Contains("sse") && request.Method == HttpMethod.Post)
        {
            // Drop the network action by returning a forbidden response
            var response = new HttpResponseMessage(System.Net.HttpStatusCode.Forbidden) {
                RequestMessage = request,
                ReasonPhrase = "SSE POST requests are not allowed."
            };
            return Task.FromResult(response);
        }
        request.SetBrowserRequestCredentials(BrowserRequestCredentials.Include);
        request.SetBrowserResponseStreamingEnabled(true);
        return base.SendAsync(request, cancellationToken);
    }
}