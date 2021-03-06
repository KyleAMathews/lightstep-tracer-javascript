'use strict';

const Suite = require('sc-benchmark').Suite;
const OpenTracing = require('opentracing');
const LightStep = require('..');


function createNoopTracer() {
    return OpenTracing.initNewTracer(null);
}
function createNonReportingTracer() {
    return OpenTracing.initNewTracer(LightStep.tracer({
        component_name         : 'lightstep-tracer/benchmarks',
        access_token           : 'unused',
        disable_reporting_loop : true,
    }));
}
function createNestedObject(n) {
    if (n === 0) {
        return 42;
    }
    let m = {};
    for (let i = 0; i < 2*n; i++) {
        m[`key-${i}`] = createNestedObject(n - 1);
    }
    return m;
}
function busyWait(ms) {
    let start = process.hrtime();
    let delta;
    do {
        let t = process.hrtime(start);
        delta = t[0] * 1e3 + t[1] / 1e6;
    } while (delta < ms);
}

let s = new Suite();

s.bench('sanity check (10ms)', (N, t) => {
    for (let i = 0; i < N; i++) {
        busyWait(10.0);
    }
});

let setups = [
    {
        name        : 'noop',
        makeTracer  : createNoopTracer,
    },
    {
        name        : 'ls',
        makeTracer  : createNonReportingTracer,
    }
];

for (let setup of setups) {
    s.bench(`startSpan (${setup.name})`, (N, t) => {
        let tracer = setup.makeTracer();
        t.start();
        for (let i = 0; i < N; i++) {
            let span = tracer.startSpan('test');
            span.finish();
        }
    });

    if (setup.name === 'ls') {
        // Test without the OT interface indirection
        s.bench(`startSpan imp (${setup.name})`, (N, t) => {
            let tracer = createNonReportingTracer();
            let tracerImp = tracer.imp();
            t.start();
            for (let i = 0; i < N; i++) {
                let spanImp = tracerImp.startSpan('test');
                spanImp.finish();
            }
        });
    }

    s.bench(`span with logs (${setup.name})`, (N, t) => {
        let tracer = setup.makeTracer();
        t.start();
        for (let i = 0; i < N; i++) {
            let span = tracer.startSpan('test');
            span.logEvent('Hello world!');
            span.finish();
        }
    });

    s.bench(`span with 100 logs (${setup.name})`, (N, t) => {
        let tracer = setup.makeTracer();
        t.start();
        for (let i = 0; i < N; i++) {
            let span = tracer.startSpan('test');
            for (let j = 0; j < 100; j++) {
                span.logEvent('Hello world!');
            }
            span.finish();
        }
    });

    if (setup.name === 'ls') {
        // Test without the OT interface indirection
        s.bench(`span with 100 logs imp (${setup.name})`, (N, t) => {
            let tracer = createNonReportingTracer();
            let tracerImp = tracer.imp();
            t.start();
            for (let i = 0; i < N; i++) {
                let spanImp = tracerImp.startSpan('test');
                for (let j = 0; j < 100; j++) {
                    spanImp.log({ event: 'Hello world!' });
                }
                spanImp.finish();
            }
        });
    }

    s.bench(`log with payload (${setup.name})`, (N, t) => {
        let tracer = setup.makeTracer();
        let payload = createNestedObject(5);
        t.start();
        for (let i = 0; i < N; i++) {
            let span = tracer.startSpan('test');
            span.logEvent('Hello world!', payload);
            span.finish();
        }
    });

    s.bench(`nested spans (${setup.name})`, (N, t) => {
        let tracer = setup.makeTracer();
        function makeNested(depth, parent) {
            if (depth === 0) {
                return;
            }
            let span = tracer.startSpan('test', { parent : parent });
            makeNested(depth - 1, span);
            span.finish();
        }
        t.start();
        for (let i = 0; i < N; i++) {
            makeNested(32);
        }
    });
}

s.run();
