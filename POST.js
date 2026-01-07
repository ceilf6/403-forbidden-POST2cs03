// Moodle 测验自动提交脚本
// 运行: node POST.js

const https = require('https');
const fs = require('fs');

// ============ 配置 ============
const CONFIG = {
    attempt: '1298',
    cmid: '167',
    sesskey: 'g4ngReJi5R',
    cookies: 'MoodleSession=; MOODLEID1_='
};

// 要提交的页面和答案 (可以添加多个)
// page: 页码从0开始 (第1页=0, 第2页=1...)
// selectedChoices: 选中的选项索引 (a=0, b=1, c=2, d=3...)
const SUBMISSIONS = [
    { page: 1, selectedChoices: [1, 2, 3, 4, 5, 6, 7, 8] },
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

    // 更稳健的正则：允许单双引号、任意属性顺序、跨行情况
    // sequencecheck 的值可能包含字母数字，放宽为 \w+
    let seqMatch = res.body.match(/name=["']q(\d+):(\d+)_:sequencecheck["'][^>]*value=["'](\w+)["']/);
    if (!seqMatch) {
        seqMatch = res.body.match(/name=["']q(\d+):(\d+)_:sequencecheck["'][\s\S]*?value=["'](\w+)["']/);
    }
    if (!seqMatch) {
        seqMatch = res.body.match(/id=["']q(\d+):(\d+)_:sequencecheck["'][^>]*value=["'](\w+)["']/);
    }

    if (!seqMatch) {
        // 将页面保存到文件，方便离线查看原因
        try {
            fs.writeFileSync('./last_page.html', res.body);
            console.error('   ⚠️ 页面内容已保存到 ./last_page.html 以供调试');
        } catch (e) {
            console.error('   ⚠️ 无法写入 last_page.html:', e.message);
        }
        throw new Error('无法提取页面信息，可能session过期（页面已保存到 last_page.html）');
    }

    const questionId = seqMatch[1];
    const slot = seqMatch[2];
    const sequencecheck = seqMatch[3];

    // 尝试从页面中提取 sesskey（如果存在则覆盖配置中的值）
    const sessMatch = res.body.match(/name=["']sesskey["'][^>]*value=["']([A-Za-z0-9]+)["']/);
    if (sessMatch) {
        CONFIG.sesskey = sessMatch[1];
        console.log(`   🔑 从页面提取到 sesskey=${CONFIG.sesskey}`);
    } else {
        console.log('   ⚠️ 未能从页面提取 sesskey，使用配置中现有 sesskey');
    }

    return { questionId, slot, sequencecheck };
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
