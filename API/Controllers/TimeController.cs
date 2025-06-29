using Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Services;

namespace API.Controllers {
    [ApiController]
    [Route("[controller]")]
    public class TimeController : ControllerBase {
        private readonly TimeService _timeService;

        public TimeController(TimeService timeService) {
            _timeService = timeService;
        }

        [Authorize]
        [HttpGet(Name = "GetTime")]
        public TimeResultDto Get()
        {
            string name = HttpContext?.User?.Identity?.Name ?? "anonymous";
            DateTime cTime = _timeService.GetCurrentTime();
            return new TimeResultDto { Name = name, CTime = cTime };
        }
    }
}
