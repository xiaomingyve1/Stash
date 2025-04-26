// ================ 常量定义 ================
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
  'Accept-Language': 'en',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache'
};
const UA = REQUEST_HEADERS['User-Agent'];

const STATUS_COMING = 2;
const STATUS_AVAILABLE = 1;
const STATUS_NOT_AVAILABLE = 0;
const STATUS_TIMEOUT = -1;
const STATUS_ERROR = -2;

// ================ 网络检测 ================
async function check_network_status() {
  // 断开连接前先测试网络
  return new Promise((resolve, reject) => {
    $httpClient.get(
      { url: 'https://www.google.com/generate_204', timeout: 5000 },
      (error, response) => {
        if (error || response.status !== 204) reject('网络不可用');
        else resolve('ok');
      }
    );
  });
}

// ================ 时间格式化 ================
function getFormattedTime() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// ================ 主体检测流程 ================
;(async () => {
  let panel_result = {
    title: '多平台流媒体解锁检测',
    content: '',
    icon: 'play.tv.fill',
    'icon-color': '#FF2D55'
  };

  try {
    await check_network_status();
  } catch (e) {
    panel_result.content =
      `最后刷新时间: ${getFormattedTime()}` +
      '\n────────────────\n' +
      '网络不可用，请检查连接';
    $done(panel_result);
    $httpClient.disconnect();
    return;
  }

  // —— 并行检测平台 ——  
  const checks = [
    check_netflix(),
    check_disneyplus(),
    check_chatgpt(),
    check_youtube_premium(),
    check_tiktok(),
    check_hulu(),
    check_amazon(),
    check_hbomax()
  ];

  let results;
  try {
    results = await Promise.all(checks);
    const timeHeader = [
      `最后刷新时间: ${getFormattedTime()}`,
      '────────────────'
    ];
    panel_result.content = [...timeHeader, ...results].join('\n');
  } catch (e) {
    console.log('检测异常:', e);
    panel_result.content =
      `最后刷新时间: ${getFormattedTime()}` +
      '\n────────────────\n' +
      '部分检测失败，请查看结果';
  }

  // 输出面板结果并立即断开连接
  $done(panel_result);
  $httpClient.disconnect();
})();

// ================ Netflix ================
async function check_netflix() {
  function inner_check(filmId) {
    return new Promise((resolve, reject) => {
      $httpClient.get({
        url: 'https://www.netflix.com/title/' + filmId,
        headers: REQUEST_HEADERS
      }, (error, response) => {
        if (error) return reject('Error');
        if (response.status === 403) return reject('Not Available');
        if (response.status === 404) return resolve('Not Found');
        if (response.status === 200) {
          let url = response.headers['x-originating-url'];
          let region = url.split('/')[3].split('-')[0];
          if (region === 'title') region = 'us';
          return resolve(region);
        }
        reject('Error');
      });
    });
  }

  let res = 'Netflix: ';
  await inner_check(81280792)
    .then((code) => {
      if (code === 'Not Found') return inner_check(80018499);
      res += '已解锁，区域: ' + code.toUpperCase();
      return Promise.reject('BreakSignal');
    })
    .then((code) => {
      if (code === 'Not Found') return Promise.reject('Not Available');
      res += '仅自制剧，区域: ' + code.toUpperCase();
      return Promise.reject('BreakSignal');
    })
    .catch((error) => {
      if (error !== 'BreakSignal') {
        res += '检测失败，请刷新面板';
      }
    });
  return res;
}

// ================ Disney+ ================
async function check_disneyplus() {
  let res = 'Disney+: ';
  try {
    const { region, status } = await testDisneyPlus();
    if (status === STATUS_AVAILABLE) {
      res += '已解锁，区域: ' + region.toUpperCase();
    } else if (status === STATUS_COMING) {
      res += '即将上线，区域: ' + region.toUpperCase();
    } else {
      res += '检测失败，请刷新面板';
    }
  } catch (e) {
    res += '检测失败，请刷新面板';
  }
  return res;
}

async function testDisneyPlus() {
  try {
    let { region } = await Promise.race([testHomePage(), timeout(7000)]);
    let info = await Promise.race([getLocationInfo(), timeout(7000)]);
    let countryCode = info.countryCode ?? region;
    let inSupportedLocation = info.inSupportedLocation;
    if (inSupportedLocation === false || inSupportedLocation === 'false') {
      return { region: countryCode, status: STATUS_COMING };
    } else {
      return { region: countryCode, status: STATUS_AVAILABLE };
    }
  } catch {
    return { status: STATUS_ERROR };
  }
}

function testHomePage() {
  return new Promise((resolve, reject) => {
    $httpClient.get(
      {
        url: 'https://www.disneyplus.com/',
        headers: REQUEST_HEADERS
      },
      (error, response, data) => {
        if (
          error ||
          response.status !== 200 ||
          data.includes('Sorry, Disney+ is not available in your region.')
        ) {
          return reject('Not Available');
        }
        let m = data.match(/Region: ([A-Za-z]{2})[\s\S]*?CNBL: ([12])/);
        if (!m) return resolve({ region: '', cnbl: '' });
        resolve({ region: m[1], cnbl: m[2] });
      }
    );
  });
}

function getLocationInfo() {
  return new Promise((resolve, reject) => {
    $httpClient.post(
      {
        url: 'https://disney.api.edge.bamgrid.com/graph/v1/device/graphql',
        headers: {
          'Accept-Language': 'en',
          Authorization:
            'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84',
          'Content-Type': 'application/json',
          'User-Agent': UA,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          query:
            'mutation registerDevice($input: RegisterDeviceInput!) { registerDevice(registerDevice: $input) { grant { grantType assertion } } }',
          variables: {
            input: {
              applicationRuntime: 'chrome',
              attributes: {
                browserName: 'chrome',
                browserVersion: '94.0.4606',
                manufacturer: 'apple',
                model: null,
                operatingSystem: 'macintosh',
                operatingSystemVersion: '10.15.7',
                osDeviceIds: []
              },
              deviceFamily: 'browser',
              deviceLanguage: 'en',
              deviceProfile: 'macosx'
            }
          }
        })
      },
      (error, response, data) => {
        if (error || response.status !== 200) return reject('Not Available');
        data = JSON.parse(data);
        if (data.errors) return reject('Not Available');
        let {
          session: {
            inSupportedLocation,
            location: { countryCode }
          }
        } = data.extensions.sdk;
        resolve({ inSupportedLocation, countryCode });
      }
    );
  });
}

// ================ ChatGPT ================
async function check_chatgpt() {
  let result = 'ChatGPT: ';
  try {
    let { status, country } = await Promise.race([
      timeout(10000),
      new Promise((resolve) => {
        $httpClient.get(
          {
            url: 'https://chat.openai.com/cdn-cgi/trace',
            headers: REQUEST_HEADERS
          },
          (error, response, data) => {
            if (error) return resolve({ status: STATUS_ERROR });
            if (response.status !== 200)
              return resolve({ status: STATUS_NOT_AVAILABLE });
            let m = data.match(/loc=([A-Z]{2})/);
            if (m)
              resolve({ status: STATUS_AVAILABLE, country: m[1] });
            else resolve({ status: STATUS_NOT_AVAILABLE });
          }
        );
      })
    ]);
    if (status === STATUS_AVAILABLE) {
      result += `已解锁，区域: ${country.toUpperCase()}`;
    } else {
      result += '检测失败，请刷新面板';
    }
  } catch {
    result += '检测失败，请刷新面板';
  }
  return result;
}

// ================ YouTube Premium ================
async function check_youtube_premium() {
  function inner_check() {
    return new Promise((resolve, reject) => {
      $httpClient.get(
        {
          url: 'https://www.youtube.com/premium',
          headers: REQUEST_HEADERS
        },
        (error, response, data) => {
          if (error || response.status !== 200) return reject('Error');
          if (data.includes('Premium is not available in your country')) {
            return resolve('Not Available');
          }
          let re = /"countryCode":"(.*?)"/gm;
          let m = re.exec(data);
          let region = m ? m[1] : data.includes('www.google.cn') ? 'CN' : 'US';
          resolve(region);
        }
      );
    });
  }

  let res = 'YouTube: ';
  await inner_check()
    .then((code) => {
      if (code === 'Not Available') res += '检测失败，请刷新面板';
      else res += '已解锁，区域: ' + code.toUpperCase();
    })
    .catch(() => {
      res += '检测失败，请刷新面板';
    });
  return res;
}

// ================ TikTok ================
async function check_tiktok() {
  let res = 'TikTok: ';
  try {
    let response = await Promise.race([
      timeout(5000),
      new Promise((resolve) => {
        $httpClient.get(
          {
            url: 'https://www.tiktok.com/',
            headers: REQUEST_HEADERS
          },
          (error, response, data) => {
            if (error || response.status !== 200)
              return resolve({ error: true });
            let m = data.match(/region.*?:.*?"([A-Z]{2})"/);
            resolve({ error: false, region: m ? m[1] : 'US' });
          }
        );
      })
    ]);
    if (response.error) throw new Error();
    res += response.region === 'CN'
      ? '受限区域 🚫'
      : `已解锁，区域: ${response.region}`;
  } catch {
    res = 'TikTok: 检测失败，请刷新面板';
  }
  return res;
}

// ================ Hulu ================
async function check_hulu() {
  let res = 'Hulu: ';
  try {
    // 1)
    let home = await Promise.race([huluHome(), timeout(8000)]);
    // 2)
    let api = await Promise.race([huluApi(), timeout(8000)]);
    // 判断
    if (
      home &&
      home.available === true &&
      api &&
      api.country_code &&
      api.items_count > 0
    ) {
      res += `已解锁，区域: ${api.country_code.toUpperCase()}`;
    } else {
      res += '检测失败，请刷新面板';
    }
  } catch {
    res += '检测失败，请刷新面板';
  }
  return res;
}

function huluHome() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://discover.hulu.com/content/v4/hubs/home',
      headers: { ...REQUEST_HEADERS, Accept: 'application/json' }
    }, (err, resp, body) => {
      if (err || resp.status !== 200) return resolve(null);
      try {
        let d = JSON.parse(body);
        let ok = Array.isArray(d.components) && d.components.some(c => c.items && c.items.length>0);
        resolve({ available: ok });
      } catch {
        resolve(null);
      }
    });
  });
}

function huluApi() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://api.hulu.com/v1/account/region',
      headers: { ...REQUEST_HEADERS, Accept: 'application/json' }
    }, (err, resp, body) => {
      if (err || resp.status !== 200) return resolve(null);
      try {
        let j = JSON.parse(body);
        resolve({
          country_code: j.country_code,
          items_count: j.available_content_count
        });
      } catch {
        resolve(null);
      }
    });
  });
}

// ================ Amazon Prime Video ================
async function check_amazon() {
  let res = 'Amazon: ';
  try {
    let home = await Promise.race([amazonHome(), timeout(8000)]);
    let api = await Promise.race([amazonApi(), timeout(8000)]);
    if (home && home.available && api && api.countryCode) {
      res += `已解锁，区域: ${api.countryCode.toUpperCase()}`;
    } else {
      res += '检测失败，请刷新面板';
    }
  } catch {
    res += '检测失败，请刷新面板';
  }
  return res;
}

function amazonHome() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://www.primevideo.com/region-announcement',
      headers: REQUEST_HEADERS
    }, (err, resp, body) => {
      if (err || resp.status !== 200) return resolve(null);
      resolve({ available: !body.includes('not available in your country') });
    });
  });
}

function amazonApi() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://www.primevideo.com/api/video/v2/web/atv/regions/current',
      headers: { ...REQUEST_HEADERS, Accept: 'application/json' }
    }, (err, resp, data) => {
      if (err || resp.status !== 200) return resolve(null);
      try {
        let j = JSON.parse(data);
        resolve({ countryCode: j.countryCode });
      } catch {
        resolve(null);
      }
    });
  });
}

// ================ HBO Max ================
async function check_hbomax() {
  let res = 'HBO Max: ';
  try {
    let home = await Promise.race([hbomaxHome(), timeout(8000)]);
    let api = await Promise.race([hbomaxApi(), timeout(8000)]);
    if (home && home.available && api && api.country) {
      res += `已解锁，区域: ${api.country.toUpperCase()}`;
    } else {
      res += '检测失败，请刷新面板';
    }
  } catch {
    res += '检测失败，请刷新面板';
  }
  return res;
}

function hbomaxHome() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://www.hbomax.com/',
      headers: REQUEST_HEADERS
    }, (err, resp, body) => {
      if (err || resp.status !== 200) return resolve(null);
      resolve({ available: !body.includes('not available in your region') });
    });
  });
}

function hbomaxApi() {
  return new Promise((resolve) => {
    $httpClient.get({
      url: 'https://www.hbomax.com/api/v2/geo',
      headers: { ...REQUEST_HEADERS, Accept: 'application/json' }
    }, (err, resp, data) => {
      if (err || resp.status !== 200) return resolve(null);
      try {
        let j = JSON.parse(data);
        resolve({ country: j.country });
      } catch {
        resolve(null);
      }
    });
  });
}

// ================ 通用函数 ================
function timeout(delay = 5000) {
  return new Promise((_, reject) =>
    setTimeout(() => reject('Timeout'), delay)
  );
}
