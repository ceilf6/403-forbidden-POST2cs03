// Moodle 测验自动提交脚本
// 运行: node POST.js

const https = require('https');

// ============ 配置 ============
const CONFIG = {
    attempt: '1228',
    cmid: '167',
    sesskey: 'g4ngReJi5R',
    cookies: 'MoodleSession=; MOODLEID1_='
};

// 要提交的页面和答案 (可以添加多个)
// page: 页码从0开始 (第1页=0, 第2页=1...)
// selectedChoices: 选中的选项索引 (a=0, b=1, c=2, d=3...)
const SUBMISSIONS = [
    { page: 1, selectedChoices: [0, 1, 3, 4, 5, 6, 7, 8] },
    // { page: 3, selectedChoices: [0, 2] },  // 可以添加更多
];

// ============ 函数 ============

function httpsRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('超时')); });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

async function getPageInfo(page) {
    console.log(`\n📄 获取第 ${page + 1} 页...`);

    const res = await httpsRequest({
        hostname: 'cs03.online',
        path: `/mod/quiz/attempt.php?attempt=${CONFIG.attempt}&cmid=${CONFIG.cmid}&page=${page}`,
        method: 'GET',
        headers: {
            'Cookie': CONFIG.cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    });

    const seqMatch = res.body.match(/name="q(\d+):(\d+)_:sequencecheck"\s+value="(\d+)"/);
    if (!seqMatch) throw new Error('无法提取页面信息，可能session过期');

    return { questionId: seqMatch[1], slot: seqMatch[2], sequencecheck: seqMatch[3] };
}

async function submitAnswer(page, info, selectedChoices) {
    const qPrefix = `q${info.questionId}:${info.slot}_`;

    const formData = new URLSearchParams();
    formData.append(`${qPrefix}:flagged`, '0');
    formData.append(`${qPrefix}:sequencecheck`, info.sequencecheck);

    for (let i = 0; i < 10; i++) {
        formData.append(`${qPrefix}choice${i}`, '0');
        if (selectedChoices.includes(i)) {
            formData.append(`${qPrefix}choice${i}`, '1');
        }
    }

    formData.append('next', '下一页');
    formData.append('attempt', CONFIG.attempt);
    formData.append('thispage', page.toString());
    formData.append('nextpage', (page + 1).toString());
    formData.append('timeup', '0');
    formData.append('sesskey', CONFIG.sesskey);
    formData.append('mdlscrollto', '');
    formData.append('slots', info.slot);

    const body = formData.toString();

    console.log(`📤 提交答案 (选项: ${selectedChoices.map(i => String.fromCharCode(97 + i)).join(', ')})...`);

    const res = await httpsRequest({
        hostname: 'cs03.online',
        path: `/mod/quiz/processattempt.php?cmid=${CONFIG.cmid}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Cookie': CONFIG.cookies,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Origin': 'https://cs03.online',
            'Referer': `https://cs03.online/mod/quiz/attempt.php?attempt=${CONFIG.attempt}&cmid=${CONFIG.cmid}&page=${page}`
        }
    }, body);

    if (res.status === 303 || res.status === 302) {
        console.log(`   ✅ 成功! 跳转到: ${res.headers.location}`);
        return true;
    } else {
        console.log(`   ❌ 失败! 状态码: ${res.status}`);
        return false;
    }
}

// ============ 主程序 ============
async function main() {
    console.log('🚀 Moodle 测验提交脚本');
    console.log('========================');

    for (const sub of SUBMISSIONS) {
        try {
            const info = await getPageInfo(sub.page);
            console.log(`   ✓ questionId=${info.questionId}, slot=${info.slot}, seq=${info.sequencecheck}`);
            await submitAnswer(sub.page, info, sub.selectedChoices);
        } catch (err) {
            console.error(`❌ 错误: ${err.message}`);
        }
    }

    console.log('\n🎉 完成!');
}

main();
