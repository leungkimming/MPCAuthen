using Microsoft.AspNetCore.Mvc;

namespace API.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class LLMController : ControllerBase
    {
        private readonly ILogger<LLMController> _logger;
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public LLMController(ILogger<LLMController> logger, IConfiguration configuration, HttpClient httpClient)
        {
            _logger = logger;
            _configuration = configuration;
            _httpClient = httpClient;
        }

        [HttpPost]
        public async Task<IActionResult> Proxy()
        {
            var request = HttpContext.Request;
            // Get the proxy target URI from configuration
            var targetUri = _configuration["LLM:EndPoint"];

            HttpRequestMessage proxiedRequest = new HttpRequestMessage(
                HttpMethod.Post,
                targetUri
            );

            // Copy request content
            request.EnableBuffering(); // Allow rereading the body
            using (var reader = new StreamReader(request.Body, leaveOpen: true))
            {
                var body = await reader.ReadToEndAsync();
                request.Body.Position = 0; // Reset for downstream
                var contentType = request.ContentType ?? "application/json";
                proxiedRequest.Content = new StringContent(body, System.Text.Encoding.UTF8, contentType);
            }
            _httpClient.DefaultRequestHeaders.Add("api-key", _configuration["LLM:Azure_API_Key"] ?? "");
            _httpClient.DefaultRequestHeaders.Add("authorization", "Bearer " + _configuration["LLM:Azure_API_Key"] ?? "");
            // Send request
            HttpResponseMessage response;
            try {
                response = await _httpClient.SendAsync(proxiedRequest, HttpCompletionOption.ResponseHeadersRead);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error while sending request to LLM endpoint.");
                return StatusCode(StatusCodes.Status502BadGateway, "Error while communicating with the LLM service.");
            }

            // Copy response headers
            foreach (var header in response.Headers)
            {
                Response.Headers[header.Key] = header.Value.ToArray();
            }
            foreach (var header in response.Content.Headers)
            {
                Response.Headers[header.Key] = header.Value.ToArray();
            }
            Response.StatusCode = (int)response.StatusCode;

            // Return the proxied response body
            var responseStream = await response.Content.ReadAsStreamAsync();
            return new FileStreamResult(responseStream, response.Content.Headers.ContentType?.ToString() ?? "application/octet-stream");
        }
    }
}
